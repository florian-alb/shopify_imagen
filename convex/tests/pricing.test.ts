import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "../pricing";

describe("estimateCostUsd", () => {
  it("computes USD cost from input/output token usage", () => {
    // gemini-3.1-flash-lite: $0.25 input / $1.50 output per 1M tokens
    const cost = estimateCostUsd("gemini-3.1-flash-lite", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(0.25 + 1.5);
  });
});
