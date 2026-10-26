import { v } from "convex/values"
import { googleFeedAttributeValidator, googleFeedDraftStatusValidator } from "./validators"

export const feedViewValidator = v.union(
  v.literal("review"),
  v.literal("ready"),
  v.literal("errors"),
)
export const feedProductValidator = v.object({
  id: v.id("products"),
  title: v.string(),
  featuredImageUrl: v.union(v.string(), v.null()),
  attributes: v.array(googleFeedAttributeValidator),
  variantCount: v.number(),
  fieldCount: v.number(),
})
export const feedRowValidator = v.object({
  id: v.id("googleFeedDrafts"),
  variantId: v.union(v.id("productVariants"), v.null()),
  variantTitle: v.string(),
  attribute: googleFeedAttributeValidator,
  currentValue: v.union(v.string(), v.null()),
  proposedValue: v.string(),
  sourceKind: v.union(v.literal("manual"), v.literal("rule")),
  sourceLabel: v.string(),
  status: googleFeedDraftStatusValidator,
  included: v.boolean(),
  updatedAt: v.number(),
  error: v.union(v.string(), v.null()),
})
