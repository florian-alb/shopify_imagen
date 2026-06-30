/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { estimateCostUsd } from "./pricing";

const modules = import.meta.glob("./**/*.ts");

describe("estimateCostUsd", () => {
  it("computes USD cost from input/output token usage", async () => {
    const t = convexTest(schema, modules);

    // gemini-3.1-flash-lite: $0.25 input / $1.50 output per 1M tokens
    const cost = await t.run(async () =>
      estimateCostUsd("gemini-3.1-flash-lite", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000
      })
    );

    expect(cost).toBeCloseTo(0.25 + 1.5);
  });
});
