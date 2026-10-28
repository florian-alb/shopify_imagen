import { describe, expect, test, vi } from "vitest"
import type { Id } from "@/lib/convex"
import type { FeedDetails, FeedProduct } from "../types"
import { applyBulkFeedDecision, bulkFeedTargets } from "./bulk-decisions"
import { collectFilteredFeedProducts, loadBulkFeedDetails } from "./filtered-selection"

function product(index: number): FeedProduct {
  return {
    id: `product-${index}` as Id<"products">, title: `Produit filtré ${index}`,
    featuredImageUrl: null, attributes: ["gender"], variantCount: 1, fieldCount: 1,
  }
}
function details(id: Id<"products">): FeedDetails {
  return {
    product: { ...product(0), id }, manualRows: [], conflicts: [],
    rows: [{
      id: `${id}-row` as Id<"googleFeedDrafts">, variantId: null, variantTitle: "Produit",
      attribute: "gender", currentValue: null, proposedValue: "male", sourceKind: "rule",
      sourceLabel: "Règle", status: "conflict", included: true, updatedAt: 42, error: null,
    }],
  }
}

describe("filtered Google feed selection", () => {
  test("collects all matching pages from the beginning, including empty intermediate pages", async () => {
    const products = Array.from({ length: 21 }, (_, index) => product(index))
    const readPage = vi.fn()
      .mockResolvedValueOnce({ products: products.slice(0, 10), after: product(9).id, hasMore: true })
      .mockResolvedValueOnce({ products: [], after: product(15).id, hasMore: true })
      .mockResolvedValueOnce({ products: products.slice(9), after: product(20).id, hasMore: false })
    const progress = vi.fn()
    const result = await collectFilteredFeedProducts(readPage, progress, new AbortController().signal)
    expect(result).toEqual(products)
    expect(readPage.mock.calls).toEqual([[undefined], [product(9).id], [product(15).id]])
    expect(progress.mock.calls).toEqual([[10], [10], [21]])
  })

  test("rejects an incomplete selection when the server omits or repeats a cursor", async () => {
    for (const after of [null, product(0).id]) {
      const readPage = vi.fn().mockResolvedValue({ products: [product(0)], after, hasMore: true })
      await expect(collectFilteredFeedProducts(readPage, vi.fn(), new AbortController().signal))
        .rejects.toThrow("chargement des produits est incomplet")
      expect(readPage).toHaveBeenCalledTimes(after ? 2 : 1)
    }
  })

  test("does not return a truncated selection when a subsequent page fails", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ products: [product(0)], after: product(0).id, hasMore: true })
      .mockRejectedValueOnce(new Error("Connexion interrompue"))
    await expect(collectFilteredFeedProducts(readPage, vi.fn(), new AbortController().signal))
      .rejects.toThrow("Connexion interrompue")
  })

  test("cancels after an in-flight page without accepting its result or requesting the next one", async () => {
    const controller = new AbortController()
    const readPage = vi.fn(async () => {
      controller.abort()
      return { products: [product(0)], after: product(0).id, hasMore: true }
    })
    const progress = vi.fn()
    await expect(collectFilteredFeedProducts(readPage, progress, controller.signal)).rejects.toThrow("annulée")
    expect(readPage).toHaveBeenCalledTimes(1)
    expect(progress).not.toHaveBeenCalled()
  })

  test("handles an empty filter result", async () => {
    const readPage = vi.fn().mockResolvedValue({ products: [], after: null, hasMore: false })
    expect(await collectFilteredFeedProducts(readPage, vi.fn(), new AbortController().signal)).toEqual([])
  })
})

describe("loading large Google feed selections", () => {
  test("limits concurrency to four requests and retains compact snapshots in product order", async () => {
    const ids = Array.from({ length: 11 }, (_, index) => product(index).id)
    let active = 0
    let maximum = 0
    const read = vi.fn(async (id: Id<"products">) => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active--
      return details(id)
    })
    const progress = vi.fn()
    const result = await loadBulkFeedDetails(ids, read, progress, new AbortController().signal)
    expect(maximum).toBe(4)
    expect(result.map((snapshot) => snapshot.product.id)).toEqual(ids)
    expect(result[0].rows).toEqual([{
      id: `${ids[0]}-row`, attribute: "gender", sourceKind: "rule", status: "conflict", included: true, updatedAt: 42,
    }])
    expect(progress.mock.calls).toEqual([[4], [8], [11]])
  })

  test("stops loading further batches after cancellation", async () => {
    const ids = Array.from({ length: 10 }, (_, index) => product(index).id)
    const controller = new AbortController()
    const read = vi.fn(async (id: Id<"products">) => details(id))
    await expect(loadBulkFeedDetails(ids, read, () => controller.abort(), controller.signal)).rejects.toThrow("annulée")
    expect(read).toHaveBeenCalledTimes(4)
  })

  test("stops at a read failure before any later batch is requested", async () => {
    const ids = Array.from({ length: 10 }, (_, index) => product(index).id)
    const read = vi.fn(async (id: Id<"products">) => {
      if (id === ids[1]) throw new Error("Produit introuvable")
      return details(id)
    })
    await expect(loadBulkFeedDetails(ids, read, vi.fn(), new AbortController().signal)).rejects.toThrow("Produit introuvable")
    expect(read).toHaveBeenCalledTimes(4)
  })

  test("corrects every selected filtered product beyond the current page", async () => {
    const products = Array.from({ length: 21 }, (_, index) => product(index))
    const readPage = vi.fn()
      .mockResolvedValueOnce({ products: products.slice(0, 10), after: product(9).id, hasMore: true })
      .mockResolvedValueOnce({ products: products.slice(10), after: null, hasMore: false })
    const signal = new AbortController().signal
    const selected = await collectFilteredFeedProducts(readPage, vi.fn(), signal)
    const snapshots = await loadBulkFeedDetails(selected.map((item) => item.id), async (id) => details(id), vi.fn(), signal)
    const choose = vi.fn().mockResolvedValue({ updated: 1, preserved: 0 })
    const result = await applyBulkFeedDecision(bulkFeedTargets(snapshots, "gender"), "gender", "unisex", choose, vi.fn())
    expect(choose).toHaveBeenCalledTimes(21)
    expect(result.completed).toEqual(products.map((item) => item.id))
    expect(choose.mock.calls.at(-1)?.[0]).toEqual({
      productId: product(20).id, rows: [{ id: `${product(20).id}-row`, updatedAt: 42 }], attribute: "gender", value: "unisex",
    })
  })
})
