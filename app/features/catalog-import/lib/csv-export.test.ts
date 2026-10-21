// @vitest-environment node
import { expect, test, vi } from "vitest"
import { shopifyCsvHeader } from "../../../../convex/catalogue/csv"
import { buildCsvFiles, type CsvPage } from "./csv-export"

const page = (data: Partial<CsvPage> = {}): CsvPage => ({ products: [], scanned: 0, skipped: 0, isDone: true, continueCursor: "", ...data })

test("continues through empty pages and reports exported versus skipped products", async () => {
  const read = vi.fn().mockResolvedValueOnce(page({ scanned: 20, skipped: 20, isDone: false, continueCursor: "next" }))
    .mockResolvedValueOnce(page({ products: ["robe,été\r\n"], scanned: 1 }))
  const progress = vi.fn()
  const files = await buildCsvFiles(read, progress, new AbortController().signal)
  expect(read.mock.calls).toEqual([[null], ["next"]])
  expect(await files[0].text()).toBe(shopifyCsvHeader + "robe,été\r\n")
  expect(progress).toHaveBeenLastCalledWith({ scanned: 21, exported: 1, skipped: 20 })
})
test("splits by UTF-8 bytes, repeats headers and never separates product rows", async () => {
  const group = 'été,ééé\r\n,ééé\r\n'
  const headerSize = new TextEncoder().encode("\uFEFF" + shopifyCsvHeader).length
  const limit = headerSize + new TextEncoder().encode(group).length
  const files = await buildCsvFiles(async () => page({ products: [group, group], scanned: 2 }), () => {}, new AbortController().signal, limit)
  expect(files).toHaveLength(2)
  for (const file of files) {
    expect(file.size).toBe(limit)
    expect(await file.text()).toBe(shopifyCsvHeader + group)
    expect(file.type).toBe("text/csv;charset=utf-8")
  }
})
test("rejects one oversized product without offering a truncated file", async () => {
  await expect(buildCsvFiles(async () => page({ products: ["x".repeat(5000)], scanned: 1 }), () => {}, new AbortController().signal, 2000)).rejects.toThrow("Un produit dépasse")
})
test("cancels before using an in-flight page", async () => {
  const abort = new AbortController()
  const progress = vi.fn()
  await expect(buildCsvFiles(async () => {
    abort.abort()
    return page({ products: ["a\r\n"], scanned: 1 })
  }, progress, abort.signal)).rejects.toThrow()
  expect(progress).not.toHaveBeenCalled()
})
test("rejects an empty export and a stuck cursor", async () => {
  await expect(buildCsvFiles(async () => page(), () => {}, new AbortController().signal)).rejects.toThrow("Aucune fiche")
  await expect(buildCsvFiles(async () => page({ isDone: false, continueCursor: "same" }), () => {}, new AbortController().signal)).rejects.toThrow("n’a pas progressé")
})
