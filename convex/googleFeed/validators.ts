import { v } from "convex/values"

export const googleFeedAttributeValidator = v.union(
  v.literal("google_product_category"),
  v.literal("gender"),
  v.literal("age_group"),
)

export const googleFeedOwnerTypeValidator = v.union(
  v.literal("PRODUCT"),
  v.literal("PRODUCTVARIANT"),
)

export const googleFeedCoordinateValidator = v.object({
  definitionId: v.string(),
  namespace: v.string(),
  key: v.string(),
  type: v.string(),
  ownerType: googleFeedOwnerTypeValidator,
})

export const googleFeedDiagnosticAttributeValidator = v.object({
  attribute: googleFeedAttributeValidator,
  status: v.union(
    v.literal("ready"),
    v.literal("missing"),
    v.literal("ambiguous"),
    v.literal("incompatible"),
  ),
  coordinate: v.union(googleFeedCoordinateValidator, v.null()),
  message: v.string(),
})

export const googleFeedConditionValidator = v.object({
  field: v.union(
    v.literal("product_title"),
    v.literal("product_type"),
    v.literal("vendor"),
    v.literal("tags"),
    v.literal("collections"),
    v.literal("variant_title"),
    v.literal("option_name"),
    v.literal("option_value"),
    v.literal("sku"),
    v.literal("current_attribute"),
  ),
  operator: v.union(
    v.literal("equals"),
    v.literal("not_equals"),
    v.literal("contains"),
    v.literal("not_contains"),
    v.literal("starts_with"),
    v.literal("ends_with"),
    v.literal("in"),
    v.literal("empty"),
    v.literal("not_empty"),
    v.literal("between"),
  ),
  value: v.optional(v.string()),
  values: v.optional(v.array(v.string())),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
})

export const googleFeedRuleInputValidator = v.object({
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
})

export const googleFeedDraftStatusValidator = v.union(
  v.literal("draft"),
  v.literal("conflict"),
  v.literal("invalid"),
  v.literal("publishing"),
  v.literal("confirmed"),
  v.literal("failed"),
)

export const googleFeedRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("partial"),
  v.literal("failed"),
)
