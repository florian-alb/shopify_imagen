import { describe, expect, it } from "vitest";

import type { VisualGroupWithRows } from "../types";
import { canGenerateVisualGroup } from "./visualGroupGeneration";

describe("visual group generation eligibility", () => {
  it.each([
    {
      label: "no dedicated reference",
      ready: false,
      hasReference: false,
      textOnly: false,
      expected: true,
    },
    {
      label: "pending reference in use",
      ready: false,
      hasReference: true,
      textOnly: false,
      expected: false,
    },
    {
      label: "pending reference explicitly ignored",
      ready: false,
      hasReference: true,
      textOnly: true,
      expected: true,
    },
    {
      label: "confirmed reference in use",
      ready: true,
      hasReference: true,
      textOnly: false,
      expected: true,
    },
    {
      label: "confirmed reference explicitly ignored",
      ready: true,
      hasReference: true,
      textOnly: true,
      expected: true,
    },
  ])("$label", ({ ready, hasReference, textOnly, expected }) => {
    const references = (
      hasReference ? [{ confirmed: ready }] : []
    ) as VisualGroupWithRows["references"];
    expect(canGenerateVisualGroup({ ready, references }, textOnly)).toBe(
      expected,
    );
  });
});
