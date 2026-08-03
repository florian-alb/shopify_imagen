import { describe, expect, it } from "vitest";

import {
  classifyBulkReorderOrder,
  normalizeBulkReorderPositions,
  swapBulkReorderImageIds,
} from "../../bulkReorders/model";

describe("bulk reorder model", () => {
  it("swaps any two one-based image positions", () => {
    expect(swapBulkReorderImageIds(["a", "b", "c", "d"], 1, 4)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
  });

  it("skips products that do not have the furthest image position", () => {
    expect(swapBulkReorderImageIds(["a", "b"], 1, 4)).toBeNull();
  });

  it("classifies source, target and concurrent changes", () => {
    const sourceImageIds = ["a", "b", "c"];
    const targetImageIds = ["c", "b", "a"];
    expect(
      classifyBulkReorderOrder({
        currentImageIds: sourceImageIds,
        sourceImageIds,
        targetImageIds,
      }),
    ).toBe("source");
    expect(
      classifyBulkReorderOrder({
        currentImageIds: targetImageIds,
        sourceImageIds,
        targetImageIds,
      }),
    ).toBe("target");
    expect(
      classifyBulkReorderOrder({
        currentImageIds: ["a", "c", "b"],
        sourceImageIds,
        targetImageIds,
      }),
    ).toBe("conflict");
  });

  it("rejects identical positions", () => {
    expect(() => normalizeBulkReorderPositions(2, 2)).toThrow(
      "different",
    );
  });
});
