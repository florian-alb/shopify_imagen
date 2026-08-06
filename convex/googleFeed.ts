import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { requireUserId } from "./authz"
import {
  GOOGLE_AGE_GROUPS,
  GOOGLE_GENDERS,
  selectPublishableDrafts,
  type GoogleFeedAttribute,
} from "./googleFeed/model"
import {
  googleFeedAttributeValidator,
  googleFeedConditionValidator,
  googleFeedDiagnosticAttributeValidator,
  googleFeedDraftStatusValidator,
  googleFeedOwnerTypeValidator,
  googleFeedRuleInputValidator,
  googleFeedRunStatusValidator,
} from "./googleFeed/validators"

const MAX_PRODUCTS_PER_CATALOG_SCAN = 1_000
const MAX_VARIANTS_PER_PRODUCT = 250
const MAX_DRAFTS_PER_PRODUCT = 500
const MAX_RULES = 100
export const GOOGLE_FEED_METAFIELDS_SET_BATCH_SIZE = 25

const googleFeedSyncCoordinatesValidator = v.object({
  google_product_category: v.union(
    v.object({ namespace: v.string(), key: v.string(), type: v.string() }),
    v.null(),
  ),
  gender: v.union(
    v.object({ namespace: v.string(), key: v.string(), type: v.string() }),
    v.null(),
  ),
  age_group: v.union(
    v.object({ namespace: v.string(), key: v.string(), type: v.string() }),
    v.null(),
  ),
})

type DbCtx = QueryCtx | MutationCtx

async function requireOwnedActiveShop(ctx: DbCtx) {
  const userId = await requireUserId(ctx)
  const user = await ctx.db.get(userId)
  if (!user?.activeShopId) {
    throw new ConvexError("Sélectionnez une boutique Shopify active.")
  }
  const shop = await ctx.db.get(user.activeShopId)
  if (!shop || shop.createdByUserId !== userId) {
    throw new ConvexError("La boutique active n’est pas accessible.")
  }
  return { userId, shop, shopId: shop._id }
}

async function configForShop(ctx: DbCtx, shopId: Id<"shops">) {
  return await ctx.db
    .query("googleFeedConfigs")
    .withIndex("by_shop_id", (index) => index.eq("shopId", shopId))
    .unique()
}

function coordinateFor(
  config: Doc<"googleFeedConfigs"> | null,
  attribute: GoogleFeedAttribute,
) {
  return config?.attributes.find((item) => item.attribute === attribute)
    ?.coordinate ?? null
}

function syncCoordinatesForConfig(config: Doc<"googleFeedConfigs"> | null) {
  const simpleCoordinate = (attribute: GoogleFeedAttribute) => {
    const coordinate = coordinateFor(config, attribute)
    return coordinate
      ? {
          namespace: coordinate.namespace,
          key: coordinate.key,
          type: coordinate.type,
        }
      : null
  }
  return {
    google_product_category: simpleCoordinate("google_product_category"),
    gender: simpleCoordinate("gender"),
    age_group: simpleCoordinate("age_group"),
  }
}

function assertAttributeReady(
  config: Doc<"googleFeedConfigs"> | null,
  attribute: GoogleFeedAttribute,
) {
  const coordinate = coordinateFor(config, attribute)
  if (!coordinate) {
    throw new ConvexError(
      `Le diagnostic Shopify ne permet pas encore de modifier ${attribute}.`,
    )
  }
  return coordinate
}

function validateAttributeValue(attribute: GoogleFeedAttribute, value: string) {
  const normalized = value.trim()
  if (!normalized) throw new ConvexError("La valeur ne peut pas être vide.")
  if (
    attribute === "gender" &&
    !(GOOGLE_GENDERS as readonly string[]).includes(normalized)
  ) {
    throw new ConvexError("Le genre doit être male, female ou unisex.")
  }
  if (
    attribute === "age_group" &&
    !(GOOGLE_AGE_GROUPS as readonly string[]).includes(normalized)
  ) {
    throw new ConvexError(
      "La tranche d’âge doit être newborn, infant, toddler, kids ou adult.",
    )
  }
  return normalized
}

const configValidator = v.union(
  v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("partial"),
      v.literal("blocked"),
    ),
    googleAppStatus: v.literal("unverified"),
    attributes: v.array(googleFeedDiagnosticAttributeValidator),
    checkedAt: v.number(),
  }),
  v.null(),
)

export const overview = query({
  args: {},
  returns: v.object({
    config: configValidator,
    productCount: v.number(),
    variantCount: v.number(),
    draftCount: v.number(),
    conflictCount: v.number(),
    catalogCountIsCapped: v.boolean(),
  }),
  handler: async (ctx) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const [config, products, variants, drafts, conflicts] = await Promise.all([
      configForShop(ctx, shopId),
      ctx.db
        .query("products")
        .withIndex("by_shop", (index) => index.eq("shopId", shopId))
        .take(MAX_PRODUCTS_PER_CATALOG_SCAN + 1),
      ctx.db
        .query("productVariants")
        .withIndex("by_shop_and_shopify_variant_id", (index) =>
          index.eq("shopId", shopId),
        )
        .take(5_001),
      ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_shop_id_and_status", (index) =>
          index.eq("shopId", shopId).eq("status", "draft"),
        )
        .take(5_001),
      ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_shop_id_and_status", (index) =>
          index.eq("shopId", shopId).eq("status", "conflict"),
        )
        .take(5_001),
    ])
    return {
      config: config
        ? {
            status: config.status,
            googleAppStatus: config.googleAppStatus,
            attributes: config.attributes,
            checkedAt: config.checkedAt,
          }
        : null,
      productCount: Math.min(products.length, MAX_PRODUCTS_PER_CATALOG_SCAN),
      variantCount: Math.min(variants.length, 5_000),
      draftCount: Math.min(drafts.length, 5_000),
      conflictCount: Math.min(conflicts.length, 5_000),
      catalogCountIsCapped:
        products.length > MAX_PRODUCTS_PER_CATALOG_SCAN || variants.length > 5_000,
    }
  },
})

const draftSummaryValidator = v.object({
  id: v.id("googleFeedDrafts"),
  proposedValue: v.string(),
  sourceLabel: v.string(),
  status: googleFeedDraftStatusValidator,
  included: v.boolean(),
})

const catalogProductValidator = v.object({
  id: v.id("products"),
  shopifyProductId: v.string(),
  title: v.string(),
  handle: v.string(),
  featuredImageUrl: v.union(v.string(), v.null()),
  productType: v.union(v.string(), v.null()),
  shopifyStatus: v.union(v.string(), v.null()),
  variantCount: v.number(),
  category: v.union(v.string(), v.null()),
  categoryDraft: v.union(draftSummaryValidator, v.null()),
  gender: v.union(v.string(), v.null()),
  genderInconsistent: v.boolean(),
  genderDraftCount: v.number(),
  ageGroupSummary: v.array(v.object({ value: v.string(), count: v.number() })),
  missingAgeGroupCount: v.number(),
  conflictCount: v.number(),
  modifiedCount: v.number(),
  lastSyncedAt: v.union(v.number(), v.null()),
})

type CatalogFilter = "all" | "incomplete" | "conflicts" | "modified"

function filterMatches(
  filter: CatalogFilter,
  summary: {
    category: string | null
    gender: string | null
    missingAgeGroupCount: number
    conflictCount: number
    modifiedCount: number
  },
) {
  if (filter === "incomplete") {
    return !summary.category || !summary.gender || summary.missingAgeGroupCount > 0
  }
  if (filter === "conflicts") return summary.conflictCount > 0
  if (filter === "modified") return summary.modifiedCount > 0
  return true
}

export const catalog = query({
  args: {
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
    productType: v.optional(v.string()),
    collection: v.optional(v.string()),
    shopifyStatus: v.optional(v.string()),
    gender: v.optional(v.string()),
    ageGroup: v.optional(v.string()),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("incomplete"),
        v.literal("conflicts"),
        v.literal("modified"),
      ),
    ),
  },
  returns: v.object({
    page: v.array(catalogProductValidator),
    offset: v.number(),
    limit: v.number(),
    hasPrevious: v.boolean(),
    hasNext: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const offset = Math.max(0, Math.floor(args.offset ?? 0))
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 20), 50))
    const needle = (args.search ?? "").trim().toLocaleLowerCase("fr-FR")
    const filter = args.filter ?? "all"
    const products = await ctx.db
      .query("products")
      .withIndex("by_shop", (index) => index.eq("shopId", shopId))
      .order("desc")
      .take(MAX_PRODUCTS_PER_CATALOG_SCAN)

    const page = []
    let matched = 0
    for (const product of products) {
      const [variants, drafts] = await Promise.all([
        ctx.db
          .query("productVariants")
          .withIndex("by_shop_and_product_id", (index) =>
            index.eq("shopId", shopId).eq("productId", product._id),
          )
          .take(MAX_VARIANTS_PER_PRODUCT),
        ctx.db
          .query("googleFeedDrafts")
          .withIndex("by_product_id", (index) =>
            index.eq("productId", product._id),
          )
          .take(MAX_DRAFTS_PER_PRODUCT),
      ])
      const scopedDrafts = drafts.filter((draft) => draft.shopId === shopId)
      const searchMatches =
        !needle ||
        product.title.toLocaleLowerCase("fr-FR").includes(needle) ||
        product.handle.toLocaleLowerCase("fr-FR").includes(needle) ||
        variants.some((variant) =>
          variant.sku.toLocaleLowerCase("fr-FR").includes(needle),
        )
      if (!searchMatches) continue
      if (args.productType && product.productType !== args.productType) continue
      if (args.shopifyStatus && product.shopifyStatus !== args.shopifyStatus) continue
      if (
        args.collection &&
        !product.collections.some(
          (collection: { id?: string; handle?: string; title?: string }) =>
            collection.id === args.collection ||
            collection.handle === args.collection ||
            collection.title === args.collection,
        )
      ) {
        continue
      }
      if (args.gender && !variants.some((variant) => variant.gender === args.gender)) {
        continue
      }
      if (
        args.ageGroup &&
        !variants.some((variant) => variant.ageGroup === args.ageGroup)
      ) {
        continue
      }

      const genderValues = new Set(
        variants.map((variant) => variant.gender).filter(Boolean) as string[],
      )
      const ageGroups = new Map<string, number>()
      for (const variant of variants) {
        if (variant.ageGroup) {
          ageGroups.set(variant.ageGroup, (ageGroups.get(variant.ageGroup) ?? 0) + 1)
        }
      }
      const categoryDraft = scopedDrafts.find(
        (draft) => draft.attribute === "google_product_category",
      )
      const conflictCount = scopedDrafts.filter(
        (draft) => draft.status === "conflict",
      ).length
      const modifiedCount = scopedDrafts.filter(
        (draft) => draft.status !== "confirmed",
      ).length
      const summary = {
        category: product.googleProductCategory ?? null,
        gender: genderValues.size === 1 ? Array.from(genderValues)[0]! : null,
        missingAgeGroupCount: variants.filter((variant) => !variant.ageGroup).length,
        conflictCount,
        modifiedCount,
      }
      if (!filterMatches(filter, summary)) continue
      if (matched >= offset && page.length < limit + 1) {
        page.push({
          id: product._id,
          shopifyProductId: product.shopifyProductId,
          title: product.title,
          handle: product.handle,
          featuredImageUrl: product.featuredImageUrl ?? null,
          productType: product.productType ?? null,
          shopifyStatus: product.shopifyStatus ?? null,
          variantCount: variants.length,
          category: summary.category,
          categoryDraft: categoryDraft
            ? {
                id: categoryDraft._id,
                proposedValue: categoryDraft.proposedValue,
                sourceLabel: categoryDraft.sourceLabel,
                status: categoryDraft.status,
                included: categoryDraft.included,
              }
            : null,
          gender: summary.gender,
          genderInconsistent: genderValues.size > 1,
          genderDraftCount: scopedDrafts.filter(
            (draft) => draft.attribute === "gender" && draft.status !== "confirmed",
          ).length,
          ageGroupSummary: Array.from(ageGroups, ([value, count]) => ({
            value,
            count,
          })).sort((left, right) => left.value.localeCompare(right.value)),
          missingAgeGroupCount: summary.missingAgeGroupCount,
          conflictCount,
          modifiedCount,
          lastSyncedAt: product.lastSyncedAt ?? null,
        })
      }
      matched += 1
      if (page.length >= limit + 1) break
    }

    return {
      page: page.slice(0, limit),
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: page.length > limit,
    }
  },
})

const variantRowValidator = v.object({
  id: v.id("productVariants"),
  shopifyVariantId: v.string(),
  title: v.string(),
  sku: v.string(),
  selectedOptions: v.array(v.object({ name: v.string(), value: v.string() })),
  gender: v.union(v.string(), v.null()),
  ageGroup: v.union(v.string(), v.null()),
  genderDraft: v.union(draftSummaryValidator, v.null()),
  ageGroupDraft: v.union(draftSummaryValidator, v.null()),
})

export const variantsForProduct = query({
  args: { productId: v.id("products") },
  returns: v.array(variantRowValidator),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const product = await ctx.db.get(args.productId)
    if (!product || product.shopId !== shopId) {
      throw new ConvexError("Produit introuvable pour la boutique active.")
    }
    const [variants, drafts] = await Promise.all([
      ctx.db
        .query("productVariants")
        .withIndex("by_shop_and_product_id", (index) =>
          index.eq("shopId", shopId).eq("productId", product._id),
        )
        .take(MAX_VARIANTS_PER_PRODUCT),
      ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_product_id", (index) => index.eq("productId", product._id))
        .take(MAX_DRAFTS_PER_PRODUCT),
    ])
    return variants.map((variant) => {
      const rowDrafts = drafts.filter(
        (draft) => draft.shopId === shopId && draft.variantId === variant._id,
      )
      const summarize = (draft: Doc<"googleFeedDrafts"> | undefined) =>
        draft
          ? {
              id: draft._id,
              proposedValue: draft.proposedValue,
              sourceLabel: draft.sourceLabel,
              status: draft.status,
              included: draft.included,
            }
          : null
      return {
        id: variant._id,
        shopifyVariantId: variant.shopifyVariantId,
        title: variant.title,
        sku: variant.sku,
        selectedOptions: variant.selectedOptions,
        gender: variant.gender ?? null,
        ageGroup: variant.ageGroup ?? null,
        genderDraft: summarize(
          rowDrafts.find((draft) => draft.attribute === "gender"),
        ),
        ageGroupDraft: summarize(
          rowDrafts.find((draft) => draft.attribute === "age_group"),
        ),
      }
    })
  },
})

const ruleRowValidator = v.object({
  id: v.id("googleFeedRules"),
  name: v.string(),
  active: v.boolean(),
  priority: v.number(),
  target: v.union(v.literal("product"), v.literal("variant")),
  attribute: googleFeedAttributeValidator,
  conditionMode: v.union(v.literal("and"), v.literal("or")),
  conditions: v.array(googleFeedConditionValidator),
  value: v.string(),
  overwritePolicy: v.union(
    v.literal("only_if_empty"),
    v.literal("replace_existing"),
  ),
  updatedAt: v.number(),
})

export const listRules = query({
  args: {},
  returns: v.array(ruleRowValidator),
  handler: async (ctx) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const rules = await ctx.db
      .query("googleFeedRules")
      .withIndex("by_shop_id_and_priority", (index) => index.eq("shopId", shopId))
      .take(MAX_RULES)
    return rules.map((rule) => ({
      id: rule._id,
      name: rule.name,
      active: rule.active,
      priority: rule.priority,
      target: rule.target,
      attribute: rule.attribute,
      conditionMode: rule.conditionMode,
      conditions: rule.conditions,
      value: rule.value,
      overwritePolicy: rule.overwritePolicy,
      updatedAt: rule.updatedAt,
    }))
  },
})

export const saveRule = mutation({
  args: {
    ruleId: v.optional(v.id("googleFeedRules")),
    rule: googleFeedRuleInputValidator,
  },
  returns: v.id("googleFeedRules"),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx)
    const name = args.rule.name.trim()
    if (!name) throw new ConvexError("Donnez un nom à la règle.")
    if (args.rule.conditions.length === 0 || args.rule.conditions.length > 10) {
      throw new ConvexError("Une règle doit contenir entre 1 et 10 conditions.")
    }
    if (
      (args.rule.attribute === "age_group" && args.rule.target !== "variant") ||
      (args.rule.attribute !== "age_group" && args.rule.target !== "product")
    ) {
      throw new ConvexError("La cible ne correspond pas à l’attribut choisi.")
    }
    const value = validateAttributeValue(args.rule.attribute, args.rule.value)
    const now = Date.now()
    const payload = {
      ...args.rule,
      name,
      value,
      priority: Math.max(0, Math.floor(args.rule.priority)),
      updatedAt: now,
    }
    if (args.ruleId) {
      const existing = await ctx.db.get(args.ruleId)
      if (!existing || existing.shopId !== shopId) {
        throw new ConvexError("Règle introuvable pour la boutique active.")
      }
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert("googleFeedRules", {
      ...payload,
      shopId,
      createdByUserId: userId,
      createdAt: now,
    })
  },
})

export const duplicateRule = mutation({
  args: { ruleId: v.id("googleFeedRules") },
  returns: v.id("googleFeedRules"),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx)
    const rule = await ctx.db.get(args.ruleId)
    if (!rule || rule.shopId !== shopId) {
      throw new ConvexError("Règle introuvable pour la boutique active.")
    }
    const now = Date.now()
    return await ctx.db.insert("googleFeedRules", {
      shopId,
      createdByUserId: userId,
      name: `${rule.name} — copie`,
      active: false,
      priority: rule.priority + 1,
      target: rule.target,
      attribute: rule.attribute,
      conditionMode: rule.conditionMode,
      conditions: rule.conditions,
      value: rule.value,
      overwritePolicy: rule.overwritePolicy,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const deleteRule = mutation({
  args: { ruleId: v.id("googleFeedRules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const rule = await ctx.db.get(args.ruleId)
    if (!rule || rule.shopId !== shopId) {
      throw new ConvexError("Règle introuvable pour la boutique active.")
    }
    await ctx.db.delete(rule._id)
    return null
  },
})

async function upsertDraft(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">
    userId: Id<"users">
    productId: Id<"products">
    variantId: Id<"productVariants"> | null
    ownerId: string
    ownerType: "PRODUCT" | "PRODUCTVARIANT"
    attribute: GoogleFeedAttribute
    currentValue: string | null
    currentDigest: string | null
    proposedValue: string
    sourceKind: "manual" | "rule"
    sourceRuleId: Id<"googleFeedRules"> | null
    sourceLabel: string
    matchingRuleIds?: Id<"googleFeedRules">[]
    status: "draft" | "conflict"
  },
) {
  const existing = await ctx.db
    .query("googleFeedDrafts")
    .withIndex("by_shop_id_and_owner_id_and_attribute", (index) =>
      index
        .eq("shopId", args.shopId)
        .eq("ownerId", args.ownerId)
        .eq("attribute", args.attribute),
    )
    .unique()
  const now = Date.now()
  const payload = {
    productId: args.productId,
    variantId: args.variantId,
    ownerId: args.ownerId,
    ownerType: args.ownerType,
    attribute: args.attribute,
    currentValue: args.currentValue,
    currentDigest: args.currentDigest,
    proposedValue: args.proposedValue,
    sourceKind: args.sourceKind,
    sourceRuleId: args.sourceRuleId,
    sourceLabel: args.sourceLabel,
    matchingRuleIds: args.matchingRuleIds,
    status: args.status,
    included: true,
    error: null,
    updatedAt: now,
  }
  if (existing) {
    await ctx.db.patch(existing._id, payload)
    return existing._id
  }
  return await ctx.db.insert("googleFeedDrafts", {
    ...payload,
    shopId: args.shopId,
    createdByUserId: args.userId,
    createdAt: now,
  })
}

export const setProductDraft = mutation({
  args: {
    productId: v.id("products"),
    attribute: v.union(
      v.literal("google_product_category"),
      v.literal("gender"),
    ),
    value: v.string(),
  },
  returns: v.object({ updatedDrafts: v.number() }),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx)
    const [product, config] = await Promise.all([
      ctx.db.get(args.productId),
      configForShop(ctx, shopId),
    ])
    if (!product || product.shopId !== shopId) {
      throw new ConvexError("Produit introuvable pour la boutique active.")
    }
    assertAttributeReady(config, args.attribute)
    const value = validateAttributeValue(args.attribute, args.value)
    if (args.attribute === "google_product_category") {
      await upsertDraft(ctx, {
        shopId,
        userId,
        productId: product._id,
        variantId: null,
        ownerId: product.shopifyProductId,
        ownerType: "PRODUCT",
        attribute: args.attribute,
        currentValue: product.googleProductCategory ?? null,
        currentDigest: product.googleProductCategoryDigest ?? null,
        proposedValue: value,
        sourceKind: "manual",
        sourceRuleId: null,
        sourceLabel: "Proposition manuelle",
        status: "draft",
      })
      return { updatedDrafts: 1 }
    }
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_shop_and_product_id", (index) =>
        index.eq("shopId", shopId).eq("productId", product._id),
      )
      .take(MAX_VARIANTS_PER_PRODUCT)
    for (const variant of variants) {
      await upsertDraft(ctx, {
        shopId,
        userId,
        productId: product._id,
        variantId: variant._id,
        ownerId: variant.shopifyVariantId,
        ownerType: "PRODUCTVARIANT",
        attribute: "gender",
        currentValue: variant.gender ?? null,
        currentDigest: variant.genderDigest ?? null,
        proposedValue: value,
        sourceKind: "manual",
        sourceRuleId: null,
        sourceLabel: "Proposition manuelle",
        status: "draft",
      })
    }
    return { updatedDrafts: variants.length }
  },
})

export const setVariantDraft = mutation({
  args: {
    variantId: v.id("productVariants"),
    value: v.string(),
  },
  returns: v.id("googleFeedDrafts"),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx)
    const [variant, config] = await Promise.all([
      ctx.db.get(args.variantId),
      configForShop(ctx, shopId),
    ])
    if (!variant || variant.shopId !== shopId) {
      throw new ConvexError("Variante introuvable pour la boutique active.")
    }
    assertAttributeReady(config, "age_group")
    const value = validateAttributeValue("age_group", args.value)
    return await upsertDraft(ctx, {
      shopId,
      userId,
      productId: variant.productId,
      variantId: variant._id,
      ownerId: variant.shopifyVariantId,
      ownerType: "PRODUCTVARIANT",
      attribute: "age_group",
      currentValue: variant.ageGroup ?? null,
      currentDigest: variant.ageGroupDigest ?? null,
      proposedValue: value,
      sourceKind: "manual",
      sourceRuleId: null,
      sourceLabel: "Proposition manuelle",
      status: "draft",
    })
  },
})

export const setDraftInclusion = mutation({
  args: { draftId: v.id("googleFeedDrafts"), included: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.shopId !== shopId) {
      throw new ConvexError("Modification introuvable pour la boutique active.")
    }
    await ctx.db.patch(draft._id, { included: args.included, updatedAt: Date.now() })
    return null
  },
})

export const updateDraftValue = mutation({
  args: { draftId: v.id("googleFeedDrafts"), value: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx)
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.shopId !== shopId) {
      throw new ConvexError("Modification introuvable pour la boutique active.")
    }
    const config = await configForShop(ctx, shopId)
    assertAttributeReady(config, draft.attribute)
    const value = validateAttributeValue(draft.attribute, args.value)
    await ctx.db.patch(draft._id, {
      proposedValue: value,
      sourceKind: "manual",
      sourceRuleId: null,
      sourceLabel: "Correction manuelle",
      matchingRuleIds: undefined,
      status: "draft",
      included: true,
      error: null,
      createdByUserId: userId,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const discardDraft = mutation({
  args: { draftId: v.id("googleFeedDrafts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.shopId !== shopId) {
      throw new ConvexError("Modification introuvable pour la boutique active.")
    }
    await ctx.db.delete(draft._id)
    return null
  },
})

const previewRowValidator = v.object({
  id: v.id("googleFeedDrafts"),
  productId: v.id("products"),
  variantId: v.union(v.id("productVariants"), v.null()),
  productTitle: v.string(),
  variantTitle: v.union(v.string(), v.null()),
  ownerId: v.string(),
  ownerType: googleFeedOwnerTypeValidator,
  attribute: googleFeedAttributeValidator,
  currentValue: v.union(v.string(), v.null()),
  proposedValue: v.string(),
  sourceLabel: v.string(),
  status: googleFeedDraftStatusValidator,
  included: v.boolean(),
  error: v.union(v.string(), v.null()),
})

export const preview = query({
  args: {
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("ready"),
        v.literal("conflict"),
        v.literal("invalid"),
        v.literal("excluded"),
      ),
    ),
  },
  returns: v.object({
    page: v.array(previewRowValidator),
    offset: v.number(),
    limit: v.number(),
    hasPrevious: v.boolean(),
    hasNext: v.boolean(),
    readyCount: v.number(),
    conflictCount: v.number(),
    invalidCount: v.number(),
    excludedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const offset = Math.max(0, Math.floor(args.offset ?? 0))
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100))
    const drafts = await ctx.db
      .query("googleFeedDrafts")
      .withIndex("by_shop_id_and_updated_at", (index) => index.eq("shopId", shopId))
      .order("desc")
      .take(5_000)
    const active = drafts.filter((draft) => draft.status !== "confirmed")
    const readyCount = selectPublishableDrafts(
      active.map((draft) => ({
        id: draft._id,
        included: draft.included,
        status: draft.status,
        currentValue: draft.currentValue,
        proposedValue: draft.proposedValue,
      })),
    ).length
    const filter = args.status ?? "all"
    const filtered = active.filter((draft) => {
      if (filter === "ready") {
        return (
          draft.included &&
          (draft.status === "draft" || draft.status === "failed") &&
          draft.currentValue !== draft.proposedValue
        )
      }
      if (filter === "conflict") return draft.status === "conflict"
      if (filter === "invalid") return draft.status === "invalid"
      if (filter === "excluded") return !draft.included
      return true
    })
    const selected = filtered.slice(offset, offset + limit + 1)
    const rows = []
    for (const draft of selected.slice(0, limit)) {
      const [product, variant] = await Promise.all([
        ctx.db.get(draft.productId),
        draft.variantId ? ctx.db.get(draft.variantId) : null,
      ])
      if (!product || product.shopId !== shopId) continue
      rows.push({
        id: draft._id,
        productId: draft.productId,
        variantId: draft.variantId ?? null,
        productTitle: product.title,
        variantTitle: variant?.title ?? null,
        ownerId: draft.ownerId,
        ownerType: draft.ownerType,
        attribute: draft.attribute,
        currentValue: draft.currentValue,
        proposedValue: draft.proposedValue,
        sourceLabel: draft.sourceLabel,
        status: draft.status,
        included: draft.included,
        error: draft.error ?? null,
      })
    }
    return {
      page: rows,
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: selected.length > limit,
      readyCount,
      conflictCount: active.filter((draft) => draft.status === "conflict").length,
      invalidCount: active.filter((draft) => draft.status === "invalid").length,
      excludedCount: active.filter((draft) => !draft.included).length,
    }
  },
})

const historyRowValidator = v.object({
  id: v.id("googleFeedRuns"),
  kind: v.union(v.literal("evaluation"), v.literal("publication")),
  status: googleFeedRunStatusValidator,
  source: v.union(v.literal("manual"), v.literal("rules"), v.literal("retry")),
  totalItems: v.number(),
  succeededItems: v.number(),
  skippedItems: v.number(),
  failedItems: v.number(),
  conflictItems: v.number(),
  createdAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
})

export const history = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(historyRowValidator),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const page = await ctx.db
      .query("googleFeedRuns")
      .withIndex("by_shop_id_and_created_at", (index) => index.eq("shopId", shopId))
      .order("desc")
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((run) => ({
        id: run._id,
        kind: run.kind,
        status: run.status,
        source: run.source,
        totalItems: run.totalItems,
        succeededItems: run.succeededItems,
        skippedItems: run.skippedItems,
        failedItems: run.failedItems,
        conflictItems: run.conflictItems,
        createdAt: run.createdAt,
        completedAt: run.completedAt ?? null,
      })),
    }
  },
})

const runItemValidator = v.object({
  id: v.id("googleFeedRunItems"),
  ownerId: v.string(),
  attribute: googleFeedAttributeValidator,
  oldValue: v.union(v.string(), v.null()),
  newValue: v.string(),
  sourceLabel: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("confirmed"),
    v.literal("skipped"),
    v.literal("conflict"),
    v.literal("failed"),
  ),
  error: v.union(v.string(), v.null()),
})

export const runDetails = query({
  args: { runId: v.id("googleFeedRuns"), limit: v.optional(v.number()) },
  returns: v.object({ run: historyRowValidator, items: v.array(runItemValidator) }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run || run.shopId !== shopId) {
      throw new ConvexError("Exécution introuvable pour la boutique active.")
    }
    const items = await ctx.db
      .query("googleFeedRunItems")
      .withIndex("by_shop_id_and_run_id", (index) =>
        index.eq("shopId", shopId).eq("runId", run._id),
      )
      .take(Math.max(1, Math.min(args.limit ?? 200, 500)))
    return {
      run: {
        id: run._id,
        kind: run.kind,
        status: run.status,
        source: run.source,
        totalItems: run.totalItems,
        succeededItems: run.succeededItems,
        skippedItems: run.skippedItems,
        failedItems: run.failedItems,
        conflictItems: run.conflictItems,
        createdAt: run.createdAt,
        completedAt: run.completedAt ?? null,
      },
      items: items.map((item) => ({
        id: item._id,
        ownerId: item.ownerId,
        attribute: item.attribute,
        oldValue: item.oldValue,
        newValue: item.newValue,
        sourceLabel: item.sourceLabel,
        status: item.status,
        error: item.error ?? null,
      })),
    }
  },
})

export const saveDiagnostic = internalMutation({
  args: {
    shopId: v.id("shops"),
    status: v.union(
      v.literal("ready"),
      v.literal("partial"),
      v.literal("blocked"),
    ),
    attributes: v.array(googleFeedDiagnosticAttributeValidator),
    checkedAt: v.number(),
  },
  returns: v.id("googleFeedConfigs"),
  handler: async (ctx, args) => {
    const existing = await configForShop(ctx, args.shopId)
    const payload = {
      status: args.status,
      googleAppStatus: "unverified" as const,
      attributes: args.attributes,
      checkedAt: args.checkedAt,
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return await ctx.db.insert("googleFeedConfigs", {
      shopId: args.shopId,
      ...payload,
    })
  },
})

export const getActionContext = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    shopId: v.id("shops"),
    domain: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    accessToken: v.optional(v.string()),
    productQuery: v.string(),
    coordinates: googleFeedSyncCoordinatesValidator,
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.activeShopId) throw new ConvexError("Sélectionnez une boutique active.")
    const shop = await ctx.db.get(user.activeShopId)
    if (!shop || shop.createdByUserId !== args.userId) {
      throw new ConvexError("La boutique active n’est pas accessible.")
    }
    const clientId = shop.clientId ?? process.env.SHOPIFY_CLIENT_ID ?? ""
    const clientSecret = shop.clientSecret ?? process.env.SHOPIFY_CLIENT_SECRET ?? ""
    if (!clientId || !clientSecret) {
      throw new ConvexError("Les identifiants Shopify de la boutique sont absents.")
    }
    const config = await configForShop(ctx, shop._id)
    return {
      shopId: shop._id,
      domain: shop.domain,
      clientId,
      clientSecret,
      ...(shop.accessToken ? { accessToken: shop.accessToken } : {}),
      productQuery: shop.productQuery ?? "status:active,draft,archived",
      coordinates: syncCoordinatesForConfig(config),
    }
  },
})

export const getSyncCoordinates = internalQuery({
  args: { shopId: v.union(v.id("shops"), v.null()) },
  returns: googleFeedSyncCoordinatesValidator,
  handler: async (ctx, args) => {
    const config = args.shopId ? await configForShop(ctx, args.shopId) : null
    return syncCoordinatesForConfig(config)
  },
})

export const assertActiveShop = internalQuery({
  args: { userId: v.id("users") },
  returns: v.id("shops"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.activeShopId) {
      throw new ConvexError("Sélectionnez une boutique Shopify active.")
    }
    const shop = await ctx.db.get(user.activeShopId)
    if (!shop || shop.createdByUserId !== args.userId) {
      throw new ConvexError("La boutique active n’est pas accessible.")
    }
    return shop._id
  },
})

export const upsertSyncedVariants = internalMutation({
  args: {
    shopId: v.id("shops"),
    productId: v.id("products"),
    variants: v.array(
      v.object({
        shopifyVariantId: v.string(),
        title: v.string(),
        sku: v.string(),
        selectedOptions: v.array(v.object({ name: v.string(), value: v.string() })),
        gender: v.union(v.string(), v.null()),
        genderDigest: v.union(v.string(), v.null()),
        ageGroup: v.union(v.string(), v.null()),
        ageGroupDigest: v.union(v.string(), v.null()),
      }),
    ),
    removeMissing: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId)
    if (!product || product.shopId !== args.shopId) {
      throw new ConvexError("Produit synchronisé hors de la boutique attendue.")
    }
    const now = Date.now()
    const seen = new Set(args.variants.map((variant) => variant.shopifyVariantId))
    for (const variant of args.variants) {
      const existing = await ctx.db
        .query("productVariants")
        .withIndex("by_shop_and_shopify_variant_id", (index) =>
          index
            .eq("shopId", args.shopId)
            .eq("shopifyVariantId", variant.shopifyVariantId),
        )
        .unique()
      const payload = { ...variant, productId: product._id, lastSyncedAt: now, updatedAt: now }
      if (existing) await ctx.db.patch(existing._id, payload)
      else await ctx.db.insert("productVariants", { shopId: args.shopId, ...payload })
    }
    if (args.removeMissing) {
      const existingVariants = await ctx.db
        .query("productVariants")
        .withIndex("by_shop_and_product_id", (index) =>
          index.eq("shopId", args.shopId).eq("productId", product._id),
        )
        .take(MAX_VARIANTS_PER_PRODUCT + 1)
      for (const variant of existingVariants) {
        if (!seen.has(variant.shopifyVariantId)) await ctx.db.delete(variant._id)
      }
    }
    return args.variants.length
  },
})

export const getRulesForEvaluation = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({ shopId: v.id("shops"), rules: v.array(ruleRowValidator) }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.activeShopId) throw new ConvexError("Sélectionnez une boutique active.")
    const shop = await ctx.db.get(user.activeShopId)
    if (!shop || shop.createdByUserId !== args.userId) {
      throw new ConvexError("La boutique active n’est pas accessible.")
    }
    const rules = await ctx.db
      .query("googleFeedRules")
      .withIndex("by_shop_id_and_priority", (index) => index.eq("shopId", shop._id))
      .take(MAX_RULES)
    return {
      shopId: shop._id,
      rules: rules.map((rule) => ({
        id: rule._id,
        name: rule.name,
        active: rule.active,
        priority: rule.priority,
        target: rule.target,
        attribute: rule.attribute,
        conditionMode: rule.conditionMode,
        conditions: rule.conditions,
        value: rule.value,
        overwritePolicy: rule.overwritePolicy,
        updatedAt: rule.updatedAt,
      })),
    }
  },
})

const evaluationProductValidator = v.object({
  localProductId: v.id("products"),
  shopifyProductId: v.string(),
  title: v.string(),
  productType: v.string(),
  vendor: v.string(),
  tags: v.array(v.string()),
  collections: v.array(v.string()),
  googleProductCategory: v.union(v.string(), v.null()),
  googleProductCategoryDigest: v.union(v.string(), v.null()),
  manualCategory: v.boolean(),
  variants: v.array(
    v.object({
      localVariantId: v.id("productVariants"),
      shopifyVariantId: v.string(),
      title: v.string(),
      sku: v.string(),
      selectedOptions: v.array(v.object({ name: v.string(), value: v.string() })),
      gender: v.union(v.string(), v.null()),
      genderDigest: v.union(v.string(), v.null()),
      ageGroup: v.union(v.string(), v.null()),
      ageGroupDigest: v.union(v.string(), v.null()),
      manualGender: v.boolean(),
      manualAgeGroup: v.boolean(),
    }),
  ),
})

export const evaluationPage = internalQuery({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(evaluationProductValidator),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.activeShopId) throw new ConvexError("Sélectionnez une boutique active.")
    const shop = await ctx.db.get(user.activeShopId)
    if (!shop || shop.createdByUserId !== args.userId) {
      throw new ConvexError("La boutique active n’est pas accessible.")
    }
    const page = await ctx.db
      .query("products")
      .withIndex("by_shop", (index) => index.eq("shopId", shop._id))
      .paginate(args.paginationOpts)
    const rows = []
    for (const product of page.page) {
      const [variants, drafts] = await Promise.all([
        ctx.db
          .query("productVariants")
          .withIndex("by_shop_and_product_id", (index) =>
            index.eq("shopId", shop._id).eq("productId", product._id),
          )
          .take(MAX_VARIANTS_PER_PRODUCT),
        ctx.db
          .query("googleFeedDrafts")
          .withIndex("by_product_id", (index) => index.eq("productId", product._id))
          .take(MAX_DRAFTS_PER_PRODUCT),
      ])
      const manual = drafts.filter(
        (draft) => draft.shopId === shop._id && draft.sourceKind === "manual",
      )
      rows.push({
        localProductId: product._id,
        shopifyProductId: product.shopifyProductId,
        title: product.title,
        productType: product.productType ?? "",
        vendor: product.vendor ?? "",
        tags: product.tags,
        collections: product.collections
          .map((collection: { title?: string }) => collection.title)
          .filter((title): title is string => Boolean(title)),
        googleProductCategory: product.googleProductCategory ?? null,
        googleProductCategoryDigest: product.googleProductCategoryDigest ?? null,
        manualCategory: manual.some(
          (draft) => draft.attribute === "google_product_category",
        ),
        variants: variants.map((variant) => ({
          localVariantId: variant._id,
          shopifyVariantId: variant.shopifyVariantId,
          title: variant.title,
          sku: variant.sku,
          selectedOptions: variant.selectedOptions,
          gender: variant.gender ?? null,
          genderDigest: variant.genderDigest ?? null,
          ageGroup: variant.ageGroup ?? null,
          ageGroupDigest: variant.ageGroupDigest ?? null,
          manualGender: manual.some(
            (draft) => draft.variantId === variant._id && draft.attribute === "gender",
          ),
          manualAgeGroup: manual.some(
            (draft) =>
              draft.variantId === variant._id && draft.attribute === "age_group",
          ),
        })),
      })
    }
    return { ...page, page: rows }
  },
})

export const createRun = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("evaluation"), v.literal("publication")),
    source: v.union(v.literal("manual"), v.literal("rules"), v.literal("retry")),
  },
  returns: v.id("googleFeedRuns"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.activeShopId) throw new ConvexError("Sélectionnez une boutique active.")
    const shop = await ctx.db.get(user.activeShopId)
    if (!shop || shop.createdByUserId !== args.userId) {
      throw new ConvexError("La boutique active n’est pas accessible.")
    }
    const now = Date.now()
    return await ctx.db.insert("googleFeedRuns", {
      shopId: shop._id,
      createdByUserId: args.userId,
      kind: args.kind,
      status: "running",
      source: args.source,
      totalItems: 0,
      succeededItems: 0,
      skippedItems: 0,
      failedItems: 0,
      conflictItems: 0,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const saveEvaluationProposals = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("googleFeedRuns"),
    proposals: v.array(
      v.object({
        localProductId: v.id("products"),
        localVariantId: v.union(v.id("productVariants"), v.null()),
        ownerId: v.string(),
        ownerType: googleFeedOwnerTypeValidator,
        attribute: googleFeedAttributeValidator,
        currentValue: v.union(v.string(), v.null()),
        currentDigest: v.union(v.string(), v.null()),
        proposedValue: v.string(),
        selectedRuleId: v.id("googleFeedRules"),
        selectedRuleName: v.string(),
        matchingRuleIds: v.array(v.id("googleFeedRules")),
        status: v.union(v.literal("ready"), v.literal("conflict")),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.createdByUserId !== args.userId || run.status !== "running") {
      throw new ConvexError("Exécution d’évaluation invalide.")
    }
    let conflicts = 0
    for (const proposal of args.proposals) {
      const rule = await ctx.db.get(proposal.selectedRuleId)
      if (!rule || rule.shopId !== run.shopId) continue
      const draftId = await upsertDraft(ctx, {
        shopId: run.shopId,
        userId: args.userId,
        productId: proposal.localProductId,
        variantId: proposal.localVariantId,
        ownerId: proposal.ownerId,
        ownerType: proposal.ownerType,
        attribute: proposal.attribute,
        currentValue: proposal.currentValue,
        currentDigest: proposal.currentDigest,
        proposedValue: proposal.proposedValue,
        sourceKind: "rule",
        sourceRuleId: proposal.selectedRuleId,
        sourceLabel: `Proposé par « ${proposal.selectedRuleName} »`,
        matchingRuleIds: proposal.matchingRuleIds,
        status: proposal.status === "conflict" ? "conflict" : "draft",
      })
      if (proposal.status === "conflict") conflicts += 1
      await ctx.db.insert("googleFeedRunItems", {
        shopId: run.shopId,
        runId: run._id,
        draftId,
        productId: proposal.localProductId,
        variantId: proposal.localVariantId,
        ownerId: proposal.ownerId,
        ownerType: proposal.ownerType,
        attribute: proposal.attribute,
        oldValue: proposal.currentValue,
        newValue: proposal.proposedValue,
        sourceLabel: `Proposé par « ${proposal.selectedRuleName} »`,
        status: proposal.status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    await ctx.db.patch(run._id, {
      totalItems: run.totalItems + args.proposals.length,
      conflictItems: run.conflictItems + conflicts,
      succeededItems: run.succeededItems + args.proposals.length - conflicts,
      updatedAt: Date.now(),
    })
    return args.proposals.length
  },
})

export const claimPublishBatch = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("googleFeedRuns"),
    retryRunId: v.optional(v.union(v.id("googleFeedRuns"), v.null())),
  },
  returns: v.array(
    v.object({
      draftId: v.id("googleFeedDrafts"),
      runItemId: v.id("googleFeedRunItems"),
      ownerId: v.string(),
      ownerType: googleFeedOwnerTypeValidator,
      attribute: googleFeedAttributeValidator,
      namespace: v.string(),
      key: v.string(),
      type: v.string(),
      currentValue: v.union(v.string(), v.null()),
      currentDigest: v.union(v.string(), v.null()),
      proposedValue: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.createdByUserId !== args.userId || run.status !== "running") {
      throw new ConvexError("Exécution de publication invalide.")
    }
    const config = await configForShop(ctx, run.shopId)
    if (!config) throw new ConvexError("Lancez le diagnostic Shopify avant publication.")
    const statuses = args.retryRunId ? (["failed"] as const) : (["draft", "failed"] as const)
    const candidates: Doc<"googleFeedDrafts">[] = []
    for (const status of statuses) {
      const rows = await ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_shop_id_and_status", (index) =>
          index.eq("shopId", run.shopId).eq("status", status),
        )
        .take(GOOGLE_FEED_METAFIELDS_SET_BATCH_SIZE * 4)
      candidates.push(...rows)
    }
    const publishable = selectPublishableDrafts(
      candidates.map((draft) => ({
        ...draft,
        id: String(draft._id),
      })),
    )
      .filter((draft) => !args.retryRunId || draft.lastRunId === args.retryRunId)
      .slice(0, GOOGLE_FEED_METAFIELDS_SET_BATCH_SIZE)
    const claimed = []
    for (const draft of publishable) {
      const coordinate = assertAttributeReady(config, draft.attribute)
      const now = Date.now()
      const runItemId = await ctx.db.insert("googleFeedRunItems", {
        shopId: run.shopId,
        runId: run._id,
        draftId: draft._id,
        productId: draft.productId,
        variantId: draft.variantId,
        ownerId: draft.ownerId,
        ownerType: draft.ownerType,
        attribute: draft.attribute,
        oldValue: draft.currentValue,
        newValue: draft.proposedValue,
        sourceLabel: draft.sourceLabel,
        status: "ready",
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.patch(draft._id, {
        status: "publishing",
        lastRunId: run._id,
        error: null,
        updatedAt: now,
      })
      claimed.push({
        draftId: draft._id,
        runItemId,
        ownerId: draft.ownerId,
        ownerType: draft.ownerType,
        attribute: draft.attribute,
        namespace: coordinate.namespace,
        key: coordinate.key,
        type: coordinate.type,
        currentValue: draft.currentValue,
        currentDigest: draft.currentDigest ?? null,
        proposedValue: draft.proposedValue,
      })
    }
    return claimed
  },
})

export const completePublishBatch = internalMutation({
  args: {
    runId: v.id("googleFeedRuns"),
    results: v.array(
      v.object({
        draftId: v.id("googleFeedDrafts"),
        runItemId: v.id("googleFeedRunItems"),
        status: v.union(v.literal("confirmed"), v.literal("failed")),
        value: v.optional(v.string()),
        digest: v.optional(v.union(v.string(), v.null())),
        error: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.status !== "running") return null
    let succeeded = 0
    let failed = 0
    for (const result of args.results) {
      const [draft, item] = await Promise.all([
        ctx.db.get(result.draftId),
        ctx.db.get(result.runItemId),
      ])
      if (!draft || !item || draft.shopId !== run.shopId || item.runId !== run._id) {
        continue
      }
      const now = Date.now()
      if (result.status === "confirmed") {
        succeeded += 1
        await ctx.db.patch(draft._id, {
          status: "confirmed",
          currentValue: result.value ?? draft.proposedValue,
          currentDigest: result.digest ?? null,
          error: null,
          updatedAt: now,
        })
        await ctx.db.patch(item._id, { status: "confirmed", error: null, updatedAt: now })
        if (draft.attribute === "google_product_category") {
          await ctx.db.patch(draft.productId, {
            googleProductCategory: result.value ?? draft.proposedValue,
            googleProductCategoryDigest: result.digest ?? null,
            updatedAt: now,
          })
        } else if (draft.variantId) {
          await ctx.db.patch(
            draft.variantId,
            draft.attribute === "gender"
              ? {
                  gender: result.value ?? draft.proposedValue,
                  genderDigest: result.digest ?? null,
                  updatedAt: now,
                }
              : {
                  ageGroup: result.value ?? draft.proposedValue,
                  ageGroupDigest: result.digest ?? null,
                  updatedAt: now,
                },
          )
        }
      } else {
        failed += 1
        const error = result.error ?? "Shopify n’a pas confirmé la valeur."
        await ctx.db.patch(draft._id, { status: "failed", error, updatedAt: now })
        await ctx.db.patch(item._id, { status: "failed", error, updatedAt: now })
      }
    }
    await ctx.db.patch(run._id, {
      totalItems: run.totalItems + args.results.length,
      succeededItems: run.succeededItems + succeeded,
      failedItems: run.failedItems + failed,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const finishRun = internalMutation({
  args: { runId: v.id("googleFeedRuns") },
  returns: googleFeedRunStatusValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new ConvexError("Exécution introuvable.")
    const status =
      run.failedItems > 0 || run.conflictItems > 0
        ? run.succeededItems > 0
          ? ("partial" as const)
          : ("failed" as const)
        : ("completed" as const)
    await ctx.db.patch(run._id, {
      status,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    })
    return status
  },
})
