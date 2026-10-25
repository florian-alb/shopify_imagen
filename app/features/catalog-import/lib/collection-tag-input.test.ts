import { expect, test } from "vitest"
import { collectionTagTokens, commitCollectionTag, writeCollectionTag } from "./collection-tag-input"
import { collectionTagsError } from "../../../../convex/catalogue/tags"

test("adds a multiword tag and normalizes accents on commit", () => {
  const typing = writeCollectionTag("mocassins", 1, "e\u0301te\u0301 femme")
  expect(commitCollectionTag(typing, 1, " e\u0301te\u0301 femme ")).toBe("mocassins, été femme")
})

test("editing replaces exactly one tag while preserving its neighbours", () => {
  expect(commitCollectionTag("mocassins, femme, cuir", 1, "homme")).toBe("mocassins, homme, cuir")
  expect(commitCollectionTag("mocassins, femme, cuir", 1, "été, homme")).toBe("mocassins, été, homme, cuir")
})

test("pasting several comma or newline-separated tags does not create empty badges", () => {
  expect(commitCollectionTag("mocassins", 1, " femme, cuir, \r\n été\n")).toBe("mocassins, femme, cuir, été")
  expect(commitCollectionTag("", 0, "mocassins, femme")).toBe("mocassins, femme")
})

test("removes a tag, including the last one, and accepts a new first tag afterwards", () => {
  expect(commitCollectionTag("mocassins, femme", 0, "")).toBe("femme")
  expect(commitCollectionTag("femme", 0, "")).toBe("")
  expect(collectionTagTokens("")).toEqual([])
  expect(commitCollectionTag("", 0, "cuir")).toBe("cuir")
})

test("preserves invalid values and duplicates so existing collection validation can report them", () => {
  const duplicate = commitCollectionTag("été", 1, "e\u0301te\u0301")
  expect(collectionTagsError(duplicate)).toContain("fois")
  const uppercase = commitCollectionTag("mocassins", 1, "Femme")
  expect(uppercase).toBe("mocassins, Femme")
  expect(collectionTagsError(uppercase)).not.toBeNull()
  const tooMany = Array.from({ length: 61 }, (_, i) => `tag-${i}`).join(",")
  const pasted = commitCollectionTag("", 0, tooMany)
  expect(collectionTagTokens(pasted)).toHaveLength(61)
  expect(collectionTagsError(pasted)).toContain("60")
})
