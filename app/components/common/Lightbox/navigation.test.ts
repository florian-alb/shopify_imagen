import { describe, expect, it } from "vitest";

import { getLightboxNextIndex, normalizeLightboxIndex } from "./navigation";

describe("lightbox navigation", () => {
  it("wraps movement forward and backward", () => {
    expect(getLightboxNextIndex(0, 1, 3)).toBe(1);
    expect(getLightboxNextIndex(2, 1, 3)).toBe(0);
    expect(getLightboxNextIndex(0, -1, 3)).toBe(2);
  });

  it("normalizes arbitrary indexes", () => {
    expect(normalizeLightboxIndex(4, 3)).toBe(1);
    expect(normalizeLightboxIndex(-4, 3)).toBe(2);
  });

  it("returns zero for empty image sets", () => {
    expect(normalizeLightboxIndex(2, 0)).toBe(0);
    expect(getLightboxNextIndex(2, 1, 0)).toBe(0);
  });
});
