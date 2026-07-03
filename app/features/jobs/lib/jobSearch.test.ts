import { describe, expect, it } from "vitest";
import { parsePageSize, parsePositiveInt, validateJobSearch } from "./jobSearch";

describe("job search helpers", () => {
  it("keeps valid filters and strips default pagination", () => {
    expect(
      validateJobSearch({
        productId: "product_123",
        status: "completed",
        executionMode: "batch",
        provider: "gemini",
        review: "approved",
        page: "1",
        pageSize: "20",
      }),
    ).toEqual({
      productId: "product_123",
      status: "completed",
      executionMode: "batch",
      provider: "gemini",
      review: "approved",
      page: undefined,
      pageSize: undefined,
    });
  });

  it("rejects invalid enum values and unsupported page sizes", () => {
    expect(
      validateJobSearch({
        status: "done",
        executionMode: "slow",
        provider: "other",
        review: "pending",
        page: "-2",
        pageSize: "25",
      }),
    ).toEqual({
      productId: undefined,
      status: undefined,
      executionMode: undefined,
      provider: undefined,
      review: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("normalizes positive ints and supported page sizes", () => {
    expect(parsePositiveInt("3.8")).toBe(3);
    expect(parsePositiveInt(4.2)).toBe(4);
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("10")).toBeUndefined();
  });

  it("keeps non-default pagination and ignores non-string product ids", () => {
    expect(
      validateJobSearch({
        productId: 123,
        page: "02",
        pageSize: 100,
      }),
    ).toEqual({
      productId: undefined,
      status: undefined,
      executionMode: undefined,
      provider: undefined,
      review: undefined,
      page: 2,
      pageSize: 100,
    });
  });
});
