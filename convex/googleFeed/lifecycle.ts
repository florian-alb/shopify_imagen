import { ConvexError } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { isProductActive } from "../products/lifecycle"

type FeedCtx = QueryCtx | MutationCtx

// The nullable variant id is retained for older product-scoped proposals.
// A present variant id must still point to a live variant of the same product.
export async function isFeedDraftOwnerActive(ctx: FeedCtx, draft: Pick<Doc<"googleFeedDrafts">, "shopId" | "productId" | "variantId">) {
  const product = await ctx.db.get(draft.productId)
  if (!isProductActive(product) || product.shopId !== draft.shopId) return false
  if (!draft.variantId) return true
  const variant = await ctx.db.get(draft.variantId)
  return Boolean(variant && variant.shopId === draft.shopId && variant.productId === draft.productId)
}

export async function assertFeedDraftOwnerActive(ctx: FeedCtx, draft: Pick<Doc<"googleFeedDrafts">, "shopId" | "productId" | "variantId">) {
  if (!(await isFeedDraftOwnerActive(ctx, draft)))
    throw new ConvexError("Ce produit ou cette variante n’existe plus dans Shopify. Son historique est conservé.")
}

export async function filterExistingVariantDrafts(
  ctx: FeedCtx,
  shopId: Id<"shops">,
  productId: Id<"products">,
  rows: Doc<"googleFeedDrafts">[],
) {
  if (!rows.some((row) => row.variantId)) return rows
  const variants = await ctx.db.query("productVariants")
    .withIndex("by_shop_and_product_id", (index) => index.eq("shopId", shopId).eq("productId", productId))
    .take(1_001)
  if (variants.length > 1_000) throw new ConvexError("Ce produit dépasse 1 000 variantes.")
  const ids = new Set(variants.map((variant) => variant._id))
  return rows.filter((row) => !row.variantId || ids.has(row.variantId))
}

// Legacy preview counts are sampled. Keep lifecycle checks within a bounded
// number of indexed reads too, even when every row belongs to a different product.
export async function filterActiveFeedDrafts(ctx: FeedCtx, shopId: Id<"shops">, rows: Doc<"googleFeedDrafts">[]) {
  const ids = [...new Set(rows.map((row) => row.productId))]
  const active: Doc<"googleFeedDrafts">[] = []
  for (const id of ids.slice(0, 1_000)) {
    const product = await ctx.db.get(id)
    if (!isProductActive(product) || product.shopId !== shopId) continue
    active.push(...await filterExistingVariantDrafts(ctx, shopId, id, rows.filter((row) => row.productId === id)))
  }
  return { drafts: active, capped: ids.length > 1_000 }
}
