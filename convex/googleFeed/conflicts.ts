import type { Doc } from "../_generated/dataModel"
import {
  conditionMatches,
  fieldValues,
  normalizeRuleText,
  parseRuleNumber,
  type GoogleFeedCondition,
  type GoogleFeedRule,
  type RuleProductContext,
  type RuleVariantContext,
} from "./model"

export function isUnresolvedConflict(draft: Doc<"googleFeedDrafts">) {
  return draft.status === "conflict" && draft.included && draft.sourceKind !== "manual"
}

function explainsValue(condition: GoogleFeedCondition, value: string) {
  const actual = normalizeRuleText(value)
  const expected = normalizeRuleText(condition.value ?? "")
  switch (condition.operator) {
    case "equals":
      return actual === expected
    case "contains":
      return actual.includes(expected)
    case "starts_with":
      return actual.startsWith(expected)
    case "ends_with":
      return actual.endsWith(expected)
    case "in":
      return condition.values?.some((item) => normalizeRuleText(item) === actual) ?? false
    case "between": {
      const number = parseRuleNumber(value)
      return (
        number !== null &&
        number >= (condition.min ?? Infinity) &&
        number <= (condition.max ?? -Infinity)
      )
    }
    default:
      return true
  }
}

export function explainConflictRule(
  rule: GoogleFeedRule,
  product: RuleProductContext,
  variants: RuleVariantContext[],
) {
  const contexts = rule.target === "product" ? [null] : variants
  return rule.conditions.map((condition) => {
    const matched = contexts.filter((variant) =>
      conditionMatches(condition, product, variant, rule.attribute),
    )
    const actualValues = [
      ...new Set(
        matched.flatMap((variant) =>
          fieldValues(condition.field, product, variant, rule.attribute).filter((value) =>
            explainsValue(condition, value),
          ),
        ),
      ),
    ]
    return {
      condition,
      matched: matched.length > 0,
      actualValues: actualValues.slice(0, 8),
      hasMoreValues: actualValues.length > 8,
      variantTitles: matched.flatMap((variant) => (variant ? [variant.title] : [])).slice(0, 8),
    }
  })
}

export function conflictProductContext(
  product: Doc<"products">,
  variants: Doc<"productVariants">[],
): RuleProductContext {
  return {
    id: product.shopifyProductId,
    title: product.title,
    productType: product.productType ?? "",
    vendor: product.vendor ?? "",
    tags: product.tags,
    collections: product.collections.flatMap((collection: { title?: unknown }) =>
      typeof collection.title === "string" ? [collection.title] : [],
    ),
    currentValues: { google_product_category: product.googleProductCategory ?? null },
    variants: variants.map((variant) => ({
      id: String(variant._id),
      title: variant.title,
      sku: variant.sku,
      selectedOptions: variant.selectedOptions,
      currentValues: { gender: variant.gender ?? null, age_group: variant.ageGroup ?? null },
    })),
  }
}
