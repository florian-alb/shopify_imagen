import { describe, expect, it } from "vitest";

import {
  selectionSetFrom,
  toggleSelectionSetValue,
  toggleSelectionSetValues,
} from "./useSelectionSet";

describe("selection set helpers", () => {
  it("deduplicates initial values", () => {
    expect(Array.from(selectionSetFrom(["a", "b", "a"]))).toEqual(["a", "b"]);
  });

  it("toggles a single value without mutating the current set", () => {
    const current = new Set(["a", "b"]);
    const next = toggleSelectionSetValue(current, "b");

    expect(Array.from(current)).toEqual(["a", "b"]);
    expect(Array.from(next)).toEqual(["a"]);
    expect(Array.from(toggleSelectionSetValue(next, "c"))).toEqual(["a", "c"]);
  });

  it("can force-select or force-clear multiple values", () => {
    const current = new Set(["a", "b"]);
    const selected = toggleSelectionSetValues(current, ["b", "c"], true);
    const cleared = toggleSelectionSetValues(selected, ["a", "c"], false);

    expect(Array.from(selected)).toEqual(["a", "b", "c"]);
    expect(Array.from(cleared)).toEqual(["b"]);
  });
});
