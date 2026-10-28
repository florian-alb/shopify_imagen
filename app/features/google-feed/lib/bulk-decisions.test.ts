import { describe, expect, test, vi } from "vitest"
import type { Id } from "@/lib/convex"
import type { FeedDetails, FeedRow } from "../types"
import { applyBulkFeedDecision, bulkFeedTargets } from "./bulk-decisions"

function row(id: string, patch: Partial<FeedRow> = {}): FeedRow {
  return {
    id: id as Id<"googleFeedDrafts">, variantId: null, variantTitle: id,
    attribute: "gender", currentValue: null, proposedValue: "male", sourceKind: "rule",
    sourceLabel: "Règle", status: "conflict", included: true, updatedAt: 42, error: null,
    ...patch,
  }
}
function details(id: string, rows: FeedRow[]): FeedDetails {
  return {
    product: { id: id as Id<"products">, title: `Produit ${id}`, featuredImageUrl: null,
      attributes: [...new Set(rows.map((item) => item.attribute))], variantCount: rows.length, fieldCount: rows.length },
    rows, manualRows: [], conflicts: [],
  }
}

describe("bulk Google feed decisions", () => {
  test("only targets included conflicts and invalid values for the selected attribute", () => {
    const targets = bulkFeedTargets([
      details("a", [row("conflict"), row("invalid", { status: "invalid" }),
        row("manual", { sourceKind: "manual" }), row("excluded", { included: false }),
        row("publishing", { status: "publishing" }), row("confirmed", { status: "confirmed" }),
        row("ready", { status: "draft" }), row("failed", { status: "failed" }),
        row("age", { attribute: "age_group" })]),
      details("b", [row("category", { attribute: "google_product_category" })]),
    ], "gender")
    expect(targets).toEqual([{ productId: "a", title: "Produit a", rows: [
      { id: "conflict", updatedAt: 42 }, { id: "invalid", updatedAt: 42 },
    ] }])
  })

  test("supports product-level categories and every selected variant", () => {
    const targets = bulkFeedTargets([details("a", [row("category", { attribute: "google_product_category" })]),
      details("b", [row("category-b", { attribute: "google_product_category", updatedAt: 73 })]),
    ], "google_product_category")
    expect(targets.map((target) => target.rows)).toEqual([
      [{ id: "category", updatedAt: 42 }], [{ id: "category-b", updatedAt: 73 }],
    ])
  })

  test("sends the reviewed timestamps and continues after a stale product fails", async () => {
    const targets = bulkFeedTargets([details("a", [row("a")]), details("b", [row("b")]), details("c", [row("c")])], "gender")
    const choose = vi.fn().mockResolvedValueOnce({ updated: 1, preserved: 0 })
      .mockRejectedValueOnce(new Error("Les propositions ont changé."))
      .mockResolvedValueOnce({ updated: 0, preserved: 1 })
    const progress = vi.fn()
    const result = await applyBulkFeedDecision(targets, "gender", "unisex", choose, progress)
    expect(choose.mock.calls.map(([args]) => args)).toEqual(targets.map(({ productId, rows }) => ({
      productId, rows, attribute: "gender", value: "unisex",
    })))
    expect(result).toEqual({ completed: ["a", "c"], updated: 1, preserved: 1,
      failures: [{ productId: "b", title: "Produit b", message: "Les propositions ont changé." }] })
    expect(progress.mock.calls).toEqual([[1], [2], [3]])
  })

  test("does not send a mutation for products that no longer need correction", async () => {
    const targets = bulkFeedTargets([details("a", [row("a", { sourceKind: "manual" })])], "gender")
    const choose = vi.fn()
    const result = await applyBulkFeedDecision(targets, "gender", "female", choose, vi.fn())
    expect(choose).not.toHaveBeenCalled()
    expect(result.completed).toEqual([])
  })
})
