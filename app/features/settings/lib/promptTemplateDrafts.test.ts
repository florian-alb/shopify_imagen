import { describe, expect, it } from "vitest";
import {
  backgroundDraftsEqual,
  defaultAiDraftForPromptName,
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
});
