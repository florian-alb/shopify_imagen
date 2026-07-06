import { describe, expect, test } from "vitest";

import {
  applyStudioPromptContract,
  referenceImageCountForStudio,
} from "../../jobs/studioPromptContract";

describe("studio prompt contract", () => {
  test("adds final right-facing side-profile constraints", () => {
    const prompt = applyStudioPromptContract({
      imageType: "Studio — Side Profile",
      promptKind: "product_only",
      prompt:
        "Base side prompt.\nStrict left-facing side profile. The toe is on left. The heel is on right.",
    });

    expect(prompt).toContain("CRITICAL FINAL STUDIO CONTRACT");
    expect(prompt).toContain("exactly one complete shoe");
    expect(prompt).toContain("toe on the right side");
    expect(prompt).toContain("heel on the left side");
    expect(prompt).not.toContain("left-facing");
    expect(prompt).not.toContain("toe is on left");
  });

  test("adds anti-ghost pair constraints and raises front pair references", () => {
    const prompt = applyStudioPromptContract({
      imageType: "Studio — Front 3/4 Pair",
      promptKind: "product_only",
      prompt:
        "Base front prompt.\nBoth shoes point toward lower-left/front-left with heels upper-right/back-right.",
    });

    expect(prompt).toContain("exactly two complete shoes");
    expect(prompt).toContain("both toes pointing to the right side");
    expect(prompt).toContain("must not be faded, blurred, lifted, floating, or ghosted");
    expect(prompt).toContain("No shoe, shoe part, reflection, duplicate");
    expect(prompt).not.toContain("lower-left");
    expect(prompt).not.toContain("front-left");

    expect(
      referenceImageCountForStudio({
        imageType: "Studio — Front 3/4 Pair",
        promptKind: "product_only",
        requestedCount: 1,
      }),
    ).toBe(2);
  });

  test("does not change non-studio human model prompts", () => {
    const prompt = "Base worn prompt.";

    expect(
      applyStudioPromptContract({
        imageType: "On-foot — Top-down Worn View",
        promptKind: "human_model",
        prompt,
      }),
    ).toBe(prompt);
    expect(
      referenceImageCountForStudio({
        imageType: "On-foot — Top-down Worn View",
        promptKind: "human_model",
        requestedCount: 1,
      }),
    ).toBe(1);
  });
});
