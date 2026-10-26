import { ConvexError } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx, MutationCtx } from "../_generated/server"

export type FeedView = "review" | "ready" | "errors"
export const PRODUCT_DRAFT_LIMIT = 1_000

export function statusesForView(view: FeedView): Array<Doc<"googleFeedDrafts">["status"]> {
  return view === "review" ? ["conflict", "invalid"] : view === "ready" ? ["draft"] : ["failed"]
}

export function belongsToView(draft: Doc<"googleFeedDrafts">, view: FeedView) {
  if (!draft.included) return false
  if (view === "ready")
    return draft.status === "draft" && draft.currentValue !== draft.proposedValue
  if (view === "errors") return draft.status === "failed"
  return (
    draft.status === "invalid" || (draft.status === "conflict" && draft.sourceKind !== "manual")
  )
}

export function normalizeFeedSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim()
}

export async function readProductDrafts(
  ctx: QueryCtx | MutationCtx,
  shopId: Id<"shops">,
  productId: Id<"products">,
) {
  const rows = await ctx.db
    .query("googleFeedDrafts")
    .withIndex("by_product_id", (index) => index.eq("productId", productId))
    .take(PRODUCT_DRAFT_LIMIT + 1)
  if (rows.length > PRODUCT_DRAFT_LIMIT)
    throw new ConvexError("Ce produit dépasse 1 000 modifications.")
  return rows.filter((row) => row.shopId === shopId)
}

// Seek one distinct product at a time; the number of variants never affects
// page boundaries. This index also keeps old drafts outside the 5,000-row preview visible.
export async function nextProductDraft(
  ctx: QueryCtx,
  shopId: Id<"shops">,
  view: FeedView,
  after?: Id<"products">,
) {
  const heads = await Promise.all(
    statusesForView(view).map((status) =>
      ctx.db
        .query("googleFeedDrafts")
        .withIndex("by_shop_id_and_status_and_included_and_product_id", (index) => {
          const range = index.eq("shopId", shopId).eq("status", status).eq("included", true)
          return after ? range.gt("productId", after) : range
        })
        .first(),
    ),
  )
  return (
    heads
      .filter((head): head is Doc<"googleFeedDrafts"> => head !== null)
      .sort((a, b) => String(a.productId).localeCompare(String(b.productId)))[0] ?? null
  )
}

export function summarizeProduct(
  product: Doc<"products">,
  rows: Doc<"googleFeedDrafts">[],
  view: FeedView,
) {
  const selected = rows.filter((row) => belongsToView(row, view))
  return {
    id: product._id,
    title: product.title,
    featuredImageUrl: product.featuredImageUrl ?? null,
    attributes: [...new Set(selected.map((row) => row.attribute))],
    variantCount: new Set(selected.flatMap((row) => (row.variantId ? [row.variantId] : []))).size,
    fieldCount: selected.length,
  }
}
