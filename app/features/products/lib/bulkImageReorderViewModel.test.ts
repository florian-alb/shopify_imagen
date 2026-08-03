import { describe, expect, it } from "vitest";

import {
  bulkReorderEligibleCount,
  bulkReorderPositionLabel,
} from "./bulkImageReorderViewModel";

describe("bulk image reorder view model", () => {
  it("uses the furthest selected position to count eligible products", () => {
    expect(
      bulkReorderEligibleCount(
        [
          { position: 1, productCount: 10, unlockedProductCount: 8 },
          { position: 4, productCount: 7, unlockedProductCount: 6 },
        ],
        1,
        4,
      ),
    ).toBe(6);
  });

  it("rejects identical positions", () => {
    expect(
      bulkReorderEligibleCount(
        [{ position: 2, productCount: 3, unlockedProductCount: 3 }],
        2,
        2,
      ),
    ).toBe(0);
  });

  it("formats the swap without hiding its directionless behavior", () => {
    expect(bulkReorderPositionLabel(1, 4)).toBe("Positions 1 ↔ 4");
  });
});
