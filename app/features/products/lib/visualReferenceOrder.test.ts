import { describe, expect, it } from "vitest";

import {
  moveReferenceId,
  orderVisualReferences,
} from "./visualReferenceOrder";

describe("visual reference order", () => {
  it("uses the group-specific order when it exists", () => {
    expect(
      orderVisualReferences([
        { id: "shopify-first", position: 0, groupPosition: 1 },
        { id: "selected-first", position: 8, groupPosition: 0 },
      ]).map((reference) => reference.id),
    ).toEqual(["selected-first", "shopify-first"]);
  });

  it("moves a selected reference one place at a time", () => {
    expect(moveReferenceId(["a", "b", "c"], "c", -1)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(moveReferenceId(["a", "b", "c"], "a", 1)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("keeps boundary moves unchanged", () => {
    expect(moveReferenceId(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveReferenceId(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
});
