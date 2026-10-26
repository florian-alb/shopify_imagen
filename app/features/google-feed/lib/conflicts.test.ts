import { describe, expect, test } from "vitest"
import type { ConflictRule } from "../types"
import { describeRuleCondition, formatFeedValue } from "./conflicts"

function evidence(condition: ConflictRule["evidence"][number]["condition"]) {
  return { condition, matched: true, actualValues: [], hasMoreValues: false, variantTitles: [] }
}

describe("Conflict explanations", () => {
  test("distinguishes empty, translated and arbitrary category values", () => {
    expect(formatFeedValue("gender", null)).toBe("Non renseigné")
    expect(formatFeedValue("gender", "female")).toBe("Femme")
    expect(formatFeedValue("age_group", "kids")).toBe("Enfant")
    expect(formatFeedValue("google_product_category", "187")).toBe("187")
  })
  test("explains textual, numeric, list and missing-value criteria", () => {
    expect(
      describeRuleCondition(
        evidence({ field: "product_type", operator: "contains", value: "Men's" }),
      ),
    ).toBe("Type de produit contient « Men's »")
    expect(
      describeRuleCondition(
        evidence({ field: "option_value", operator: "between", min: 36, max: 50 }),
      ),
    ).toBe("Valeur d’option est compris entre 36 et 50")
    expect(
      describeRuleCondition(
        evidence({ field: "collections", operator: "in", values: ["Homme", "Garçon"] }),
      ),
    ).toBe("Collection appartient à « Homme », « Garçon »")
    expect(describeRuleCondition(evidence({ field: "current_attribute", operator: "empty" }))).toBe(
      "Valeur Google actuelle est vide",
    )
  })
})
