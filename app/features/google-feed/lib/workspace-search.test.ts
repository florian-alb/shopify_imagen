import { describe, expect, test } from "vitest"
import { nextFeedProduct, readFeedReturnTo, validateFeedSearch } from "./workspace-search"

describe("Google feed navigation", () => {
  test("keeps the trailing space while entering a multiword search", () => {
    expect(validateFeedSearch({ view: "review", q: "Mocassin " }).q).toBe("Mocassin ")
  })
  test("preserves a valid product, search and cursor when opening a rule", () => {
    const state = {
      view: "errors",
      q: "Mocassin blanc",
      product: "k".repeat(32),
      after: "a".repeat(32),
      trail: [""],
    }
    expect(readFeedReturnTo(JSON.stringify(state))).toEqual(state)
    expect(readFeedReturnTo("https://example.com")).toBeUndefined()
    expect(validateFeedSearch({ view: "conflicts", product: "invalid" }).view).toBe("review")
    expect(validateFeedSearch({ view: "modified" }).view).toBe("ready")
  })
  test("advances without selecting the product just resolved", () => {
    const products = [{ id: "a" }, { id: "b" }, { id: "c" }]
    expect(nextFeedProduct(products, "b")).toBe("c")
    expect(nextFeedProduct(products, "c")).toBe("a")
    expect(nextFeedProduct([{ id: "a" }], "a")).toBeUndefined()
  })
})
