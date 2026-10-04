import { describe, expect, test } from "vitest";
import {
  evaluatePromptCondition,
  validateConditionalPrompt,
} from "../../promptConditions";
import { renderPrompt } from "../../lib";

const context = {
  productTitle: "Peluche Éléphant",
  variantTitle: "Gris / 40 cm",
  selectedOptions: [{ name: "Tàille", value: "40 cm" }],
};
describe("conditional prompts", () => {
  test("evaluates product, variant and named option comparisons", () => {
    expect(
      evaluatePromptCondition(
        { field: "product_title", operator: "contains", value: "ELEPHANT" },
        context,
      ),
    ).toBe(true);
    expect(
      evaluatePromptCondition(
        { field: "variant_title", operator: "contains", value: "CM" },
        context,
      ),
    ).toBe(true);
    expect(
      evaluatePromptCondition(
        { field: "variant_title", operator: "equals", value: "Gris" },
        context,
      ),
    ).toBe(false);
    expect(
      evaluatePromptCondition(
        { field: "option_value", optionName: "taille", operator: "present" },
        context,
      ),
    ).toBe(true);
    expect(
      evaluatePromptCondition(
        {
          field: "option_value",
          optionName: "TAILLE",
          operator: "equals",
          value: " 40 CM ",
        },
        context,
      ),
    ).toBe(true);
  });
  test("missing and blank values always select otherwise", () => {
    for (const operator of ["present", "contains", "equals"] as const) {
      expect(
        evaluatePromptCondition(
          { field: "option_value", optionName: "Size", operator, value: "40" },
          context,
        ),
      ).toBe(false);
      expect(
        evaluatePromptCondition(
          { field: "variant_title", operator, value: "40" },
          { ...context, variantTitle: "  " },
        ),
      ).toBe(false);
    }
  });
  test("requires a complete condition and the otherwise branch", () => {
    expect(() =>
      validateConditionalPrompt(
        { field: "option_value", operator: "present" },
        "fallback",
      ),
    ).toThrow("nom");
    expect(() =>
      validateConditionalPrompt(
        { field: "variant_title", operator: "contains" },
        "fallback",
      ),
    ).toThrow("valeur");
    expect(() =>
      validateConditionalPrompt(
        { field: "variant_title", operator: "present" },
        " ",
      ),
    ).toThrow("Sinon");
    expect(() => validateConditionalPrompt(undefined)).not.toThrow();
  });
  test("renders all variant variables, arbitrary option names and literal Shopify text", () => {
    expect(
      renderPrompt(
        "{{VARIANT_TITLE}}; {{VARIANT_OPTIONS}}; {{ OPTION_VALUE : TAILLE }}; {{OPTION_VALUE:Absent}}",
        {
          VARIANT_TITLE: context.variantTitle,
          VARIANT_OPTIONS: "Tàille: 40 cm",
        },
        context.selectedOptions,
      ),
    ).toBe("Gris / 40 cm; Tàille: 40 cm; 40 cm; ");
    expect(
      renderPrompt("{{OPTION_VALUE:Motif}}", { PRODUCT_TITLE: "Changed" }, [
        { name: "Motif", value: "{{PRODUCT_TITLE}}" },
      ]),
    ).toBe("{{PRODUCT_TITLE}}");
  });
});
