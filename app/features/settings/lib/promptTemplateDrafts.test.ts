import { describe, expect, it } from "vitest";
import {
  backgroundDraftsEqual,
  compilePromptPreview,
  defaultAiDraftForPromptName,
  normalizePromptName,
  normalizeReferenceImageCount,
} from "./promptTemplateDrafts";

describe("prompt template draft helpers", () => {
  it("normalizes reference image counts to the supported range", () => {
    expect(normalizeReferenceImageCount(Number.NaN)).toBe(1);
    expect(normalizeReferenceImageCount(0)).toBe(1);
    expect(normalizeReferenceImageCount(2.6)).toBe(3);
    expect(normalizeReferenceImageCount(9)).toBe(4);
  });

  it("keeps the existing studio prompt AI defaults", () => {
    expect(defaultAiDraftForPromptName("Studio - flat lay")).toEqual({
      useVibeAnalysis: false,
      referenceImageCount: 1,
    });
    expect(defaultAiDraftForPromptName("Lifestyle - room")).toEqual({
      useVibeAnalysis: true,
      referenceImageCount: 1,
    });
  });

  it("compares background color drafts case-insensitively", () => {
    expect(
      backgroundDraftsEqual(
        {
          removeBackground: true,
          backgroundMode: "solid",
          backgroundColor: "#FFFFFF",
          backgroundShadow: true,
        },
        {
          removeBackground: true,
          backgroundMode: "solid",
          backgroundColor: "#ffffff",
          backgroundShadow: true,
        },
      ),
    ).toBe(true);
  });

  it("normalizes prompt names across spacing and dash variants", () => {
    expect(normalizePromptName("  Studio\u2014Flat   Lay ")).toBe(
      "studio - flat lay",
    );
    expect(normalizePromptName(null)).toBe("");
  });

  it("compiles prompt preview without duplicating the master prompt", () => {
    expect(compilePromptPreview("Master", "Template")).toBe(
      "Master\n\nTemplate",
    );
    expect(compilePromptPreview("Master", "Master\n\nTemplate")).toBe(
      "Master\n\nTemplate",
    );
    expect(compilePromptPreview("", "Template")).toBe("Template");
  });
});
