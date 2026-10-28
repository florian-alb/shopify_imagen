import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server"
import {
  assertAttributeReady,
  configForShop,
  requireOwnedActiveShop,
  validateAttributeValue,
} from "./googleFeed"
import {
  conflictProductContext,
  explainConflictRule,
  isUnresolvedConflict,
} from "./googleFeed/conflicts"
import {
  conflictAttributeValidator,
  conflictProductValidator,
} from "./googleFeed/conflictValidators"
import { googleFeedAttributeValidator } from "./googleFeed/validators"
import { assertFeedDraftOwnerActive, filterExistingVariantDrafts } from "./googleFeed/lifecycle"
import { isProductActive } from "./products/lifecycle"

// Products are paged by the indexed product id, so a variant never splits a
// product across pages and unrelated drafts cannot hide older conflicts.
const PAGE_SIZE = 10
const MAX_SCANNED_PRODUCTS = 60
const MAX_PRODUCT_DRAFTS = 1_000

async function productDrafts(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  productId: Id<"products">,
) {
  const drafts = await ctx.db
    .query("googleFeedDrafts")
    .withIndex("by_product_id", (index) => index.eq("productId", productId))
    .take(MAX_PRODUCT_DRAFTS + 1)
  if (drafts.length > MAX_PRODUCT_DRAFTS)
    throw new ConvexError(
      "Ce produit dépasse la limite de revue. Réduisez ses brouillons avant de le résoudre.",
    )
  return filterExistingVariantDrafts(ctx, shopId, productId, drafts.filter((draft) => draft.shopId === shopId))
}

function productSummary(product: Doc<"products">, drafts: Doc<"googleFeedDrafts">[]) {
  const conflicts = drafts.filter(isUnresolvedConflict)
  const attributes = [...new Set(conflicts.map((draft) => draft.attribute))]
  return {
    id: product._id,
    title: product.title,
    featuredImageUrl: product.featuredImageUrl ?? null,
    conflictCount: conflicts.length,
    attributes,
    manualCount: drafts.filter(
      (draft) => draft.sourceKind === "manual" && attributes.includes(draft.attribute),
    ).length,
  }
}

export const listProducts = query({
  args: { after: v.optional(v.id("products")), search: v.optional(v.string()) },
  returns: v.object({
    products: v.array(conflictProductValidator),
    after: v.union(v.id("products"), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    let after = args.after
    const search = (args.search ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
    const products = []
    for (
      let scanned = 0;
      scanned < MAX_SCANNED_PRODUCTS && products.length < PAGE_SIZE;
      scanned++
    ) {
      const first = await ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_shop_id_and_status_and_included_and_product_id", (index) => {
          const range = index.eq("shopId", shopId).eq("status", "conflict").eq("included", true)
          return after ? range.gt("productId", after) : range
        })
        .first()
      if (!first) return { products, after: after ?? null, hasMore: false }
      after = first.productId
      const product = await ctx.db.get(first.productId)
      if (!isProductActive(product) || product.shopId !== shopId) continue
      if (
        search &&
        !product.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("fr-FR")
          .includes(search)
      )
        continue
      const summary = productSummary(product, await productDrafts(ctx, shopId, product._id))
      if (summary.conflictCount) products.push(summary)
    }
    const next = await ctx.db
      .query("googleFeedDrafts")
      .withIndex("by_shop_id_and_status_and_included_and_product_id", (index) => {
        const range = index.eq("shopId", shopId).eq("status", "conflict").eq("included", true)
        return after ? range.gt("productId", after) : range
      })
      .first()
    return { products, after: after ?? null, hasMore: next !== null }
  },
})

export const productDetails = query({
  args: { productId: v.id("products") },
  returns: v.object({
    product: conflictProductValidator,
    attributes: v.array(conflictAttributeValidator),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const product = await ctx.db.get(args.productId)
    if (!isProductActive(product) || product.shopId !== shopId)
      throw new ConvexError("Produit introuvable pour la boutique active.")
    const drafts = await productDrafts(ctx, shopId, product._id)
    const conflicts = drafts.filter(isUnresolvedConflict)
    const summary = productSummary(product, drafts)
    const variantIds = [
      ...new Set(conflicts.flatMap((draft) => (draft.variantId ? [draft.variantId] : []))),
    ]
    const variants = (await Promise.all(variantIds.map((id) => ctx.db.get(id)))).filter(
      (variant): variant is Doc<"productVariants"> =>
        variant !== null && variant.shopId === shopId && variant.productId === product._id,
    )
    const variantMap = new Map(variants.map((variant) => [variant._id, variant]))
    const context = conflictProductContext(product, variants)
    const ruleIds = [
      ...new Set(
        conflicts.flatMap(
          (draft) => draft.matchingRuleIds ?? (draft.sourceRuleId ? [draft.sourceRuleId] : []),
        ),
      ),
    ]
    const rules = await Promise.all(ruleIds.map(async (id) => [id, await ctx.db.get(id)] as const))
    const ruleMap = new Map(rules)
    const attributes = summary.attributes.map((attribute) => {
      const rows = conflicts.filter((draft) => draft.attribute === attribute)
      const ids = [
        ...new Set(
          rows.flatMap(
            (draft) => draft.matchingRuleIds ?? (draft.sourceRuleId ? [draft.sourceRuleId] : []),
          ),
        ),
      ]
      return {
        attribute,
        manualCount: drafts.filter(
          (draft) => draft.attribute === attribute && draft.sourceKind === "manual",
        ).length,
        drafts: rows.map((draft) => ({
          id: draft._id,
          variantId: draft.variantId ?? null,
          variantTitle: draft.variantId
            ? (variantMap.get(draft.variantId)?.title ?? "Variante indisponible")
            : "Produit",
          currentValue: draft.currentValue,
          proposedValue: draft.proposedValue,
          updatedAt: draft.updatedAt,
          ruleIds: draft.matchingRuleIds ?? (draft.sourceRuleId ? [draft.sourceRuleId] : []),
        })),
        rules: ids.map((id) => {
          const rule = ruleMap.get(id)
          if (!rule || rule.shopId !== shopId || rule.attribute !== attribute)
            return {
              id,
              name: "Règle supprimée ou indisponible",
              value: null,
              active: false,
              missing: true,
              changed: true,
              conditionMode: "or" as const,
              evidence: [],
            }
          const related = rows.filter((draft) =>
            (draft.matchingRuleIds ?? [draft.sourceRuleId]).includes(id),
          )
          const relatedIds = new Set(related.map((draft) => String(draft.variantId)))
          return {
            id,
            name: rule.name,
            value: rule.value,
            active: rule.active,
            missing: false,
            changed: related.some((draft) => rule.updatedAt > draft.updatedAt),
            conditionMode: rule.conditionMode,
            evidence: explainConflictRule(
              { ...rule, id: rule._id },
              context,
              context.variants.filter((variant) => relatedIds.has(variant.id)),
            ),
          }
        }),
      }
    })
    return { product: summary, attributes }
  },
})

export const resolve = mutation({
  args: {
    productId: v.id("products"),
    attribute: googleFeedAttributeValidator,
    value: v.string(),
    drafts: v.array(v.object({ id: v.id("googleFeedDrafts"), updatedAt: v.number() })),
  },
  returns: v.object({ updated: v.number(), preserved: v.number() }),
  handler: async (ctx, args) => {
    const { shopId, userId } = await requireOwnedActiveShop(ctx)
    const product = await ctx.db.get(args.productId)
    if (!isProductActive(product) || product.shopId !== shopId)
      throw new ConvexError("Produit introuvable pour la boutique active.")
    if (!args.drafts.length || args.drafts.length > MAX_PRODUCT_DRAFTS)
      throw new ConvexError("Sélectionnez les modifications de ce produit à résoudre.")
    assertAttributeReady(await configForShop(ctx, shopId), args.attribute)
    const value = validateAttributeValue(args.attribute, args.value)
    let updated = 0
    let preserved = 0
    const seen = new Set<string>()
    for (const expected of args.drafts) {
      if (seen.has(expected.id)) continue
      seen.add(expected.id)
      const draft = await ctx.db.get(expected.id)
      if (
        !draft ||
        draft.shopId !== shopId ||
        draft.productId !== product._id ||
        draft.attribute !== args.attribute
      ) {
        throw new ConvexError(
          "Cette modification n’appartient pas au produit et à l’attribut sélectionnés.",
        )
      }
      if (!isUnresolvedConflict(draft)) {
        preserved++
        continue
      }
      await assertFeedDraftOwnerActive(ctx, draft)
      if (draft.updatedAt !== expected.updatedAt)
        throw new ConvexError(
          "Les propositions ont changé. Vérifiez les nouvelles valeurs avant de valider.",
        )
      await ctx.db.patch(draft._id, {
        proposedValue: value,
        sourceKind: "manual",
        sourceRuleId: null,
        matchingRuleIds: undefined,
        sourceLabel: "Résolution manuelle par produit",
        status: "draft",
        included: true,
        error: null,
        createdByUserId: userId,
        updatedAt: Date.now(),
      })
      updated++
    }
    return { updated, preserved }
  },
})
