import type { PromptCondition } from "../../../../convex/promptConditions";
import type { Doc } from "@/lib/convex";

export type ConditionalPromptDraft = {
  enabled: boolean;
  condition: PromptCondition;
  alternativeContent: string;
};
export const defaultConditionalDraft: ConditionalPromptDraft = {
  enabled: false,
  condition: {
    field: "option_value",
    operator: "present",
    optionName: "Taille",
    value: "",
  },
  alternativeContent: "",
};
export function conditionalPromptDraft(
  prompt: Pick<Doc<"promptTemplates">, "condition" | "alternativeContent">,
): ConditionalPromptDraft {
  return {
    enabled: Boolean(prompt.condition),
    condition: prompt.condition ?? defaultConditionalDraft.condition,
    alternativeContent: prompt.alternativeContent ?? "",
  };
}
export function validConditionalDraft(draft: ConditionalPromptDraft) {
  return (
    !draft.enabled ||
    Boolean(
      draft.alternativeContent.trim() &&
      (draft.condition.field !== "option_value" ||
        draft.condition.optionName?.trim()) &&
      (draft.condition.operator === "present" || draft.condition.value?.trim()),
    )
  );
}
export function conditionalDraftsEqual(
  a: ConditionalPromptDraft,
  b: ConditionalPromptDraft,
) {
  return (
    a.enabled === b.enabled &&
    a.alternativeContent === b.alternativeContent &&
    a.condition.field === b.condition.field &&
    a.condition.operator === b.condition.operator &&
    (a.condition.optionName ?? "") === (b.condition.optionName ?? "") &&
    (a.condition.value ?? "") === (b.condition.value ?? "")
  );
}
