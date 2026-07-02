import { describe, expect, it } from "vitest";

import { formatUsd } from "./formatters";

describe("formatUsd", () => {
  it("uses four decimals below one dollar and two decimals otherwise", () => {
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(0.123456)).toBe("$0.1235");
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
