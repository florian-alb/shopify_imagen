export const GOOGLE_FEED_ATTRIBUTES = [
  "google_product_category",
  "gender",
  "age_group",
] as const

export const GOOGLE_GENDERS = ["male", "female", "unisex"] as const
export const GOOGLE_AGE_GROUPS = [
  "newborn",
  "infant",
  "toddler",
  "kids",
  "adult",
] as const

export type GoogleFeedAttribute = (typeof GOOGLE_FEED_ATTRIBUTES)[number]
export type GoogleGender = (typeof GOOGLE_GENDERS)[number]
export type GoogleAgeGroup = (typeof GOOGLE_AGE_GROUPS)[number]
export type GoogleFeedOwnerType = "PRODUCT" | "PRODUCTVARIANT"

export type MetafieldDefinitionCandidate = {
  id: string
  namespace: string
  key: string
  name: string
  type: string
  ownerType: GoogleFeedOwnerType
  adminAccess: string | null
  ownerAppId: string | null
}

export type GoogleFeedAttributeDiagnostic = {
  attribute: GoogleFeedAttribute
  status: "ready" | "missing" | "ambiguous" | "incompatible"
  coordinate: {
    definitionId: string
    namespace: string
    key: string
    type: string
    ownerType: GoogleFeedOwnerType
  } | null
  message: string
}

const definitionSpecs: Record<
  GoogleFeedAttribute,
  {
    key: string
    ownerType: GoogleFeedOwnerType
    acceptedTypes: readonly string[]
  }
> = {
  google_product_category: {
    key: "google_product_category",
    ownerType: "PRODUCT",
    acceptedTypes: ["single_line_text_field", "number_integer"],
  },
  gender: {
    key: "gender",
    ownerType: "PRODUCTVARIANT",
    acceptedTypes: ["single_line_text_field"],
  },
  age_group: {
    key: "age_group",
    ownerType: "PRODUCTVARIANT",
    acceptedTypes: ["single_line_text_field"],
  },
}

function definitionIsWritable(
  candidate: MetafieldDefinitionCandidate,
  currentAppId: string | null,
) {
  if (currentAppId && candidate.ownerAppId === currentAppId) return true
  return candidate.adminAccess === "PUBLIC_READ_WRITE"
}

export function diagnoseMetafieldDefinitions(
  candidates: readonly MetafieldDefinitionCandidate[],
  currentAppId: string | null,
): {
  status: "ready" | "partial" | "blocked"
  attributes: GoogleFeedAttributeDiagnostic[]
} {
  const attributes = GOOGLE_FEED_ATTRIBUTES.map((attribute) => {
    const spec = definitionSpecs[attribute]
    const matching = candidates.filter(
      (candidate) =>
        candidate.key === spec.key && candidate.ownerType === spec.ownerType,
    )

    if (matching.length === 0) {
      return {
        attribute,
        status: "missing" as const,
        coordinate: null,
        message: `Aucune définition ${spec.ownerType} avec la clé ${spec.key}.`,
      }
    }

    const compatible = matching.filter(
      (candidate) =>
        spec.acceptedTypes.includes(candidate.type) &&
        definitionIsWritable(candidate, currentAppId),
    )

    if (compatible.length === 0) {
      return {
        attribute,
        status: "incompatible" as const,
        coordinate: null,
        message:
          "La définition existe, mais son type ou ses droits Admin API sont incompatibles.",
      }
    }

    if (compatible.length > 1) {
      return {
        attribute,
        status: "ambiguous" as const,
        coordinate: null,
        message:
          "Plusieurs définitions compatibles existent. Sélectionnez explicitement celle à utiliser.",
      }
    }

    const candidate = compatible[0]
    return {
      attribute,
      status: "ready" as const,
      coordinate: {
        definitionId: candidate.id,
        namespace: candidate.namespace,
        key: candidate.key,
        type: candidate.type,
        ownerType: candidate.ownerType,
      },
      message: "Définition lisible et modifiable par l’application.",
    }
  })

  const readyCount = attributes.filter((item) => item.status === "ready").length
  return {
    status:
      readyCount === attributes.length
        ? "ready"
        : readyCount > 0
          ? "partial"
          : "blocked",
    attributes,
  }
}

export const RULE_FIELDS = [
  "product_title",
  "product_type",
  "vendor",
  "tags",
  "collections",
  "variant_title",
  "option_name",
  "option_value",
  "sku",
  "current_attribute",
] as const

export const RULE_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "in",
  "empty",
  "not_empty",
  "between",
] as const

export type RuleField = (typeof RULE_FIELDS)[number]
export type RuleOperator = (typeof RULE_OPERATORS)[number]

export type GoogleFeedCondition = {
  field: RuleField
  operator: RuleOperator
  value?: string
  values?: string[]
  min?: number
  max?: number
}

export type GoogleFeedRule = {
  id: string
  name: string
  active: boolean
  priority: number
  target: "product" | "variant"
  attribute: GoogleFeedAttribute
  conditionMode: "and" | "or"
  conditions: GoogleFeedCondition[]
  value: string
  overwritePolicy: "only_if_empty" | "replace_existing"
}

export type RuleVariantContext = {
  id: string
  title: string
  sku: string
  selectedOptions: Array<{ name: string; value: string }>
  currentValues: Partial<Record<GoogleFeedAttribute, string | null>>
  manualAttributes?: GoogleFeedAttribute[]
}

export type RuleProductContext = {
  id: string
  title: string
  productType: string
  vendor: string
  tags: string[]
  collections: string[]
  currentValues: Partial<Record<GoogleFeedAttribute, string | null>>
  manualAttributes?: GoogleFeedAttribute[]
  variants: RuleVariantContext[]
}

export type GoogleFeedRuleProposal = {
  ownerId: string
  ownerType: GoogleFeedOwnerType
  productId: string
  variantId: string | null
  attribute: GoogleFeedAttribute
  currentValue: string | null
  proposedValue: string
  selectedRuleId: string
  selectedRuleName: string
  matchingRuleIds: string[]
  status: "ready" | "conflict"
}

export function normalizeRuleText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim()
    .replace(/\s+/g, " ")
}

export function parseRuleNumber(value: string): number | null {
  const matches = value.match(/-?\d+(?:[.,]\d+)?/g)
  if (!matches || matches.length !== 1) return null
  const parsed = Number(matches[0].replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function fieldValues(
  field: RuleField,
  product: RuleProductContext,
  variant: RuleVariantContext | null,
  attribute: GoogleFeedAttribute,
) {
  switch (field) {
    case "product_title":
      return [product.title]
    case "product_type":
      return [product.productType]
    case "vendor":
      return [product.vendor]
    case "tags":
      return product.tags
    case "collections":
      return product.collections
    case "variant_title":
      return variant ? [variant.title] : []
    case "option_name":
      return variant?.selectedOptions.map((option) => option.name) ?? []
    case "option_value":
      return variant?.selectedOptions.map((option) => option.value) ?? []
    case "sku":
      return variant ? [variant.sku] : []
    case "current_attribute": {
      const current = variant
        ? variant.currentValues[attribute]
        : product.currentValues[attribute]
      return current == null ? [] : [current]
    }
  }
}

export function conditionMatches(
  condition: GoogleFeedCondition,
  product: RuleProductContext,
  variant: RuleVariantContext | null,
  attribute: GoogleFeedAttribute,
) {
  const values = fieldValues(condition.field, product, variant, attribute)
  const normalizedValues = values.map(normalizeRuleText).filter(Boolean)
  const expected = normalizeRuleText(condition.value ?? "")

  switch (condition.operator) {
    case "empty":
      return normalizedValues.length === 0
    case "not_empty":
      return normalizedValues.length > 0
    case "equals":
      return normalizedValues.some((value) => value === expected)
    case "not_equals":
      return normalizedValues.every((value) => value !== expected)
    case "contains":
      return normalizedValues.some((value) => value.includes(expected))
    case "not_contains":
      return normalizedValues.every((value) => !value.includes(expected))
    case "starts_with":
      return normalizedValues.some((value) => value.startsWith(expected))
    case "ends_with":
      return normalizedValues.some((value) => value.endsWith(expected))
    case "in": {
      const accepted = new Set((condition.values ?? []).map(normalizeRuleText))
      return normalizedValues.some((value) => accepted.has(value))
    }
    case "between": {
      if (condition.min == null || condition.max == null) return false
      return values.some((value) => {
        const numeric = parseRuleNumber(value)
        return (
          numeric != null && numeric >= condition.min! && numeric <= condition.max!
        )
      })
    }
  }
}

function ruleMatches(
  rule: GoogleFeedRule,
  product: RuleProductContext,
  variant: RuleVariantContext | null,
) {
  if (rule.conditions.length === 0) return false
  const matches = rule.conditions.map((condition) =>
    conditionMatches(condition, product, variant, rule.attribute),
  )
  return rule.conditionMode === "and"
    ? matches.every(Boolean)
    : matches.some(Boolean)
}

function valueIsAllowed(attribute: GoogleFeedAttribute, value: string) {
  if (attribute === "gender") {
    return (GOOGLE_GENDERS as readonly string[]).includes(value)
  }
  if (attribute === "age_group") {
    return (GOOGLE_AGE_GROUPS as readonly string[]).includes(value)
  }
  return value.trim().length > 0
}

type Candidate = {
  rule: GoogleFeedRule
  ownerId: string
  ownerType: GoogleFeedOwnerType
  productId: string
  variantId: string | null
  currentValue: string | null
}

function proposalFromCandidates(candidates: Candidate[]): GoogleFeedRuleProposal {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.rule.priority - right.rule.priority ||
      left.rule.id.localeCompare(right.rule.id),
  )
  const selected = ordered[0]
  const distinctValues = new Set(ordered.map((candidate) => candidate.rule.value))
  return {
    ownerId: selected.ownerId,
    ownerType: selected.ownerType,
    productId: selected.productId,
    variantId: selected.variantId,
    attribute: selected.rule.attribute,
    currentValue: selected.currentValue,
    proposedValue: selected.rule.value,
    selectedRuleId: selected.rule.id,
    selectedRuleName: selected.rule.name,
    matchingRuleIds: ordered.map((candidate) => candidate.rule.id),
    status: distinctValues.size > 1 ? "conflict" : "ready",
  }
}

export function evaluateGoogleFeedRules(
  rules: readonly GoogleFeedRule[],
  products: readonly RuleProductContext[],
) {
  const candidates = new Map<string, Candidate[]>()
  const activeRules = rules
    .filter((rule) => rule.active && valueIsAllowed(rule.attribute, rule.value))
    .sort(
      (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
    )

  const addCandidate = (candidate: Candidate) => {
    const key = `${candidate.ownerId}:${candidate.rule.attribute}`
    candidates.set(key, [...(candidates.get(key) ?? []), candidate])
  }

  for (const product of products) {
    for (const rule of activeRules) {
      if (rule.attribute === "google_product_category") {
        if (rule.target !== "product" || !ruleMatches(rule, product, null)) continue
        const currentValue = product.currentValues.google_product_category ?? null
        if (product.manualAttributes?.includes(rule.attribute)) continue
        if (rule.overwritePolicy === "only_if_empty" && currentValue) continue
        addCandidate({
          rule,
          ownerId: product.id,
          ownerType: "PRODUCT",
          productId: product.id,
          variantId: null,
          currentValue,
        })
        continue
      }

      if (rule.attribute === "gender") {
        if (rule.target !== "product" || !ruleMatches(rule, product, null)) continue
        for (const variant of product.variants) {
          const currentValue = variant.currentValues.gender ?? null
          if (variant.manualAttributes?.includes(rule.attribute)) continue
          if (rule.overwritePolicy === "only_if_empty" && currentValue) continue
          addCandidate({
            rule,
            ownerId: variant.id,
            ownerType: "PRODUCTVARIANT",
            productId: product.id,
            variantId: variant.id,
            currentValue,
          })
        }
        continue
      }

      if (rule.target !== "variant") continue
      for (const variant of product.variants) {
        if (!ruleMatches(rule, product, variant)) continue
        const currentValue = variant.currentValues.age_group ?? null
        if (variant.manualAttributes?.includes(rule.attribute)) continue
        if (rule.overwritePolicy === "only_if_empty" && currentValue) continue
        addCandidate({
          rule,
          ownerId: variant.id,
          ownerType: "PRODUCTVARIANT",
          productId: product.id,
          variantId: variant.id,
          currentValue,
        })
      }
    }
  }

  return Array.from(candidates.values(), proposalFromCandidates)
}

export type PublishableDraft = {
  id: string
  included: boolean
  status:
    | "draft"
    | "conflict"
    | "invalid"
    | "publishing"
    | "failed"
    | "confirmed"
  currentValue: string | null
  proposedValue: string
}

export function selectPublishableDrafts<T extends PublishableDraft>(drafts: T[]) {
  return drafts.filter(
    (draft) =>
      draft.included &&
      (draft.status === "draft" || draft.status === "failed") &&
      draft.currentValue !== draft.proposedValue,
  )
}
