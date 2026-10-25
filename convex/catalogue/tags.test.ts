import { expect, test } from "vitest"
import { collectionTagKey, collectionTagsError, normalizeCollectionTags, parseCollectionTags } from "./tags"

test("collection tag lists preserve spaces within tags and normalize each comma-separated value", () => {
  expect(parseCollectionTags(" mocassins femme , e\u0301te\u0301 ")).toEqual(["mocassins femme", "été"])
  expect(normalizeCollectionTags(" mocassins , femme ")).toBe("mocassins, femme")
  expect(collectionTagsError("mocassins, femme")).toBeNull()
  expect(collectionTagsError("mocassins homme")).toBeNull()
  expect(collectionTagKey("mocassins, femme")).toBe(collectionTagKey(" femme , mocassins "))
})

test.each(["", "mocassins,", ",femme", "mocassins,,femme", "Mocassins, femme", "mocassins, tag  tag", "mocassins, " + "a".repeat(101), "été, e\u0301te\u0301"])("rejects malformed lists: %s", (value) => {
  expect(collectionTagsError(value)).not.toBeNull()
})

test("validates each tag separately and respects Shopify's 60-condition limit", () => {
  expect(collectionTagsError(`${"a".repeat(100)}, ${"b".repeat(100)}`)).toBeNull()
  const values = Array.from({ length: 60 }, (_, i) => `tag-${i}`).join(", ")
  expect(collectionTagsError(values)).toBeNull()
  expect(collectionTagsError(`${values}, extra`)).toContain("60")
})
