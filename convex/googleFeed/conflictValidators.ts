import { v } from "convex/values"
import { googleFeedAttributeValidator, googleFeedConditionValidator } from "./validators"

export const conflictProductValidator = v.object({
  id: v.id("products"),
  title: v.string(),
  featuredImageUrl: v.union(v.string(), v.null()),
  conflictCount: v.number(),
  manualCount: v.number(),
  attributes: v.array(googleFeedAttributeValidator),
})

export const conflictDraftValidator = v.object({
  id: v.id("googleFeedDrafts"),
  variantId: v.union(v.id("productVariants"), v.null()),
  variantTitle: v.string(),
  currentValue: v.union(v.string(), v.null()),
  proposedValue: v.string(),
  updatedAt: v.number(),
  ruleIds: v.array(v.id("googleFeedRules")),
})

export const conflictRuleValidator = v.object({
  id: v.id("googleFeedRules"),
  name: v.string(),
  value: v.union(v.string(), v.null()),
  active: v.boolean(),
  missing: v.boolean(),
  changed: v.boolean(),
  conditionMode: v.union(v.literal("and"), v.literal("or")),
  evidence: v.array(
    v.object({
      condition: googleFeedConditionValidator,
      matched: v.boolean(),
      actualValues: v.array(v.string()),
      hasMoreValues: v.boolean(),
      variantTitles: v.array(v.string()),
    }),
  ),
})

export const conflictAttributeValidator = v.object({
  attribute: googleFeedAttributeValidator,
  manualCount: v.number(),
  drafts: v.array(conflictDraftValidator),
  rules: v.array(conflictRuleValidator),
})
