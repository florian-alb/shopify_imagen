import { describe, expect, it } from "vitest"

import {
  conditionMatches,
  diagnoseMetafieldDefinitions,
  evaluateGoogleFeedRules,
  parseRuleNumber,
  selectPublishableDrafts,
  type GoogleFeedCondition,
  type GoogleFeedRule,
  type MetafieldDefinitionCandidate,
  type RuleProductContext,
} from "../../googleFeed/model"

const product: RuleProductContext = {
  id: "gid://shopify/Product/1",
  title: "Sandales Été",
  productType: "Chaussures",
  vendor: "Atelier",
  tags: ["Nouveauté", "Cuir"],
  collections: ["Enfants"],
  currentValues: { google_product_category: null },
  variants: [
    {
      id: "gid://shopify/ProductVariant/11",
      title: "Bleu / 22",
      sku: "SAN-22",
      selectedOptions: [
        { name: "Couleur", value: "Bleu" },
        { name: "Pointure", value: "22" },
      ],
      currentValues: { gender: null, age_group: null },
    },
    {
      id: "gid://shopify/ProductVariant/12",
      title: "Bleu / 36",
      sku: "SAN-36",
      selectedOptions: [
        { name: "Couleur", value: "Bleu" },
        { name: "Pointure", value: "36" },
      ],
      currentValues: { gender: null, age_group: null },
    },
  ],
}

function definition(
  overrides: Partial<MetafieldDefinitionCandidate>,
): MetafieldDefinitionCandidate {
  return {
    id: "definition-1",
    namespace: "google",
    key: "gender",
    name: "Gender",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT",
    adminAccess: "PUBLIC_READ_WRITE",
    ownerAppId: null,
    ...overrides,
  }
}

function rule(overrides: Partial<GoogleFeedRule>): GoogleFeedRule {
  return {
    id: "rule-1",
    name: "Règle",
    active: true,
    priority: 1,
    target: "variant",
    attribute: "age_group",
    conditionMode: "and",
    conditions: [
      { field: "option_value", operator: "between", min: 20, max: 27 },
    ],
    value: "toddler",
    overwritePolicy: "only_if_empty",
    ...overrides,
  }
}

describe("Google feed metafield diagnostic", () => {
  it("builds ready, partial and blocked states without assuming a namespace", () => {
    const all = [
      definition({
        id: "category",
        namespace: "custom_google",
        key: "google_product_category",
        ownerType: "PRODUCT",
      }),
      definition({ id: "gender", key: "gender" }),
      definition({ id: "age", key: "age_group" }),
    ]
    const ready = diagnoseMetafieldDefinitions(all, "current-app")
    expect(ready.status).toBe("ready")
    expect(ready.attributes[0]?.coordinate?.namespace).toBe("custom_google")

    expect(diagnoseMetafieldDefinitions(all.slice(0, 2), null).status).toBe(
      "partial",
    )
    expect(diagnoseMetafieldDefinitions([], null).status).toBe("blocked")
  })

  it("rejects incompatible access and ambiguous definitions", () => {
    const inaccessible = diagnoseMetafieldDefinitions(
      [definition({ adminAccess: "MERCHANT_READ_WRITE" })],
      "another-app",
    )
    expect(inaccessible.attributes[1]).toMatchObject({ status: "incompatible" })

    const ambiguous = diagnoseMetafieldDefinitions(
      [definition({ id: "one" }), definition({ id: "two", namespace: "other" })],
      null,
    )
    expect(ambiguous.attributes[1]).toMatchObject({ status: "ambiguous" })
  })
})

describe("Google feed rule operators", () => {
  const cases: Array<[GoogleFeedCondition, boolean]> = [
    [{ field: "product_title", operator: "equals", value: "sandales ete" }, true],
    [{ field: "product_type", operator: "not_equals", value: "rideaux" }, true],
    [{ field: "collections", operator: "contains", value: "fant" }, true],
    [{ field: "tags", operator: "not_contains", value: "soldé" }, true],
    [{ field: "sku", operator: "starts_with", value: "SAN" }, true],
    [{ field: "sku", operator: "ends_with", value: "22" }, true],
    [{ field: "option_name", operator: "in", values: ["Pointure"] }, true],
    [{ field: "current_attribute", operator: "empty" }, true],
    [{ field: "variant_title", operator: "not_empty" }, true],
    [{ field: "option_value", operator: "between", min: 20, max: 27 }, true],
  ]

  it.each(cases)("evaluates %s", (condition, expected) => {
    expect(conditionMatches(condition, product, product.variants[0]!, "age_group")).toBe(
      expected,
    )
  })

  it("does not guess when a numeric value is ambiguous", () => {
    expect(parseRuleNumber("20-27")).toBeNull()
    expect(parseRuleNumber("Pointure 22")).toBe(22)
  })
})

describe("Google feed rule evaluation", () => {
  it("propagates product gender to every variant", () => {
    const proposals = evaluateGoogleFeedRules(
      [
        rule({
          id: "gender",
          target: "product",
          attribute: "gender",
          conditions: [
            { field: "collections", operator: "equals", value: "Enfants" },
          ],
          value: "unisex",
        }),
      ],
      [product],
    )
    expect(proposals).toHaveLength(2)
    expect(proposals.map((proposal) => proposal.ownerId)).toEqual([
      "gid://shopify/ProductVariant/11",
      "gid://shopify/ProductVariant/12",
    ])
  })

  it("supports different age groups inside one product", () => {
    const proposals = evaluateGoogleFeedRules(
      [
        rule({ id: "small", priority: 1, value: "toddler" }),
        rule({
          id: "large",
          priority: 2,
          conditions: [
            { field: "option_value", operator: "between", min: 30, max: 40 },
          ],
          value: "adult",
        }),
      ],
      [product],
    )
    expect(proposals.map((proposal) => proposal.proposedValue)).toEqual([
      "toddler",
      "adult",
    ])
  })

  it("uses stable priority, exposes conflicts and protects manual values", () => {
    const conflicted = evaluateGoogleFeedRules(
      [
        rule({ id: "later", priority: 20, value: "kids" }),
        rule({ id: "first", priority: 10, value: "toddler" }),
      ],
      [product],
    )
    expect(conflicted[0]).toMatchObject({
      selectedRuleId: "first",
      proposedValue: "toddler",
      status: "conflict",
    })

    const manualProduct: RuleProductContext = {
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        manualAttributes: ["age_group"],
      })),
    }
    expect(evaluateGoogleFeedRules([rule({})], [manualProduct])).toEqual([])
  })
})

describe("Google feed publication selection", () => {
  it("is idempotent and ignores excluded, invalid and unchanged drafts", () => {
    const drafts = [
      {
        id: "ready",
        included: true,
        status: "draft" as const,
        currentValue: null,
        proposedValue: "adult",
      },
      {
        id: "unchanged",
        included: true,
        status: "draft" as const,
        currentValue: "adult",
        proposedValue: "adult",
      },
      {
        id: "conflict",
        included: true,
        status: "conflict" as const,
        currentValue: null,
        proposedValue: "kids",
      },
      {
        id: "excluded",
        included: false,
        status: "draft" as const,
        currentValue: null,
        proposedValue: "kids",
      },
    ]
    expect(selectPublishableDrafts(drafts).map((draft) => draft.id)).toEqual([
      "ready",
    ])
  })
})
