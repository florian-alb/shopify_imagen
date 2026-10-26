import { ageGroupOptions, genderOptions, type GoogleFeedAttribute } from "../constants"
import type { ConflictRule } from "../types"

export function formatFeedValue(attribute: GoogleFeedAttribute, value: string | null) {
  if (value === null) return "Non renseigné"
  const options =
    attribute === "gender" ? genderOptions : attribute === "age_group" ? ageGroupOptions : []
  return options.find((option) => option.value === value)?.label ?? value
}

const fieldLabels = {
  product_title: "Titre du produit",
  product_type: "Type de produit",
  vendor: "Vendeur",
  tags: "Tag",
  collections: "Collection",
  variant_title: "Titre de variante",
  option_name: "Nom d’option",
  option_value: "Valeur d’option",
  sku: "SKU",
  current_attribute: "Valeur Google actuelle",
}
const operatorLabels = {
  equals: "est égal à",
  not_equals: "n’est pas égal à",
  contains: "contient",
  not_contains: "ne contient pas",
  starts_with: "commence par",
  ends_with: "se termine par",
  in: "appartient à",
  empty: "est vide",
  not_empty: "est renseigné",
  between: "est compris entre",
}

export function describeRuleCondition(evidence: ConflictRule["evidence"][number]) {
  const condition = evidence.condition
  const expected =
    condition.operator === "between"
      ? `${condition.min} et ${condition.max}`
      : condition.operator === "in"
        ? (condition.values ?? []).map((value) => `« ${value} »`).join(", ")
        : condition.value
          ? `« ${condition.value} »`
          : ""
  return `${fieldLabels[condition.field]} ${operatorLabels[condition.operator]} ${expected}`.trim()
}
