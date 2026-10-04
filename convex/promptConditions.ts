import { v, type Infer } from "convex/values";

export const promptConditionValidator = v.object({
  field: v.union(
    v.literal("product_title"),
    v.literal("variant_title"),
    v.literal("option_value"),
  ),
  operator: v.union(
    v.literal("present"),
    v.literal("contains"),
    v.literal("equals"),
  ),
  optionName: v.optional(v.string()),
  value: v.optional(v.string()),
});
export type PromptCondition = Infer<typeof promptConditionValidator>;
export type SelectedOption = { name: string; value: string };

export function normalizeConditionText(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function optionValue(options: SelectedOption[], name: string) {
  return (
    options.find(
      (option) =>
        normalizeConditionText(option.name) === normalizeConditionText(name),
    )?.value ?? ""
  );
}

export function validateConditionalPrompt(
  condition: PromptCondition | null | undefined,
  alternativeContent?: string,
) {
  if (!condition) return;
  if (condition.field === "option_value" && !condition.optionName?.trim()) {
    throw new Error("Le nom de l’option est requis.");
  }
  if (condition.operator !== "present" && !condition.value?.trim()) {
    throw new Error("La valeur à comparer est requise.");
  }
  if (!alternativeContent?.trim())
    throw new Error("Le prompt « Sinon » est requis.");
}

export function evaluatePromptCondition(
  condition: PromptCondition,
  context: {
    productTitle: string;
    variantTitle: string;
    selectedOptions: SelectedOption[];
  },
) {
  const rawValue =
    condition.field === "product_title"
      ? context.productTitle
      : condition.field === "variant_title"
        ? context.variantTitle
        : optionValue(context.selectedOptions, condition.optionName ?? "");
  const actual = normalizeConditionText(rawValue);
  if (!actual) return false;
  if (condition.operator === "present") return true;
  const expected = normalizeConditionText(condition.value);
  if (!expected) return false;
  return condition.operator === "equals"
    ? actual === expected
    : actual.includes(expected);
}
