import { afterEach, expect, test, vi } from "vitest"
import { proposeTags } from "./ai"
import type { Collection } from "./model"

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function collections(...titles: string[]): Collection[] {
  return titles.map((title, i) => ({
    key: `collection-${i}`, title, url: `https://example.com/collections/${i}`,
    description: "", image: null, tag: "", validated: false, outsideMenu: false,
    membership: "complete", count: 0, selectedCount: 0,
  }))
}

function mockResponse(value: unknown, finishReason = "STOP") {
  vi.stubEnv("GEMINI_API_KEY", "test-only")
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }],
  })))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

test("adapts separate AI tags to the existing action contract and preserves compound concepts", async () => {
  const source = collections("Mocassins beige homme", "Tables basses rondes", "Sacs à main bleu marine")
  const fetchMock = mockResponse({ tags: [
    { key: source[0].key, tags: ["mocassins", "beige", "homme"] },
    { key: source[1].key, tags: ["table basse", "rond"] },
    { key: source[2].key, tags: ["sac à main", "bleu marine"] },
  ] })
  expect(await proposeTags(source, "fr")).toEqual([
    { key: source[0].key, tag: "mocassins, beige, homme" },
    { key: source[1].key, tag: "table basse, rond" },
    { key: source[2].key, tag: "sac à main, bleu marine" },
  ])
  const request = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(request.generationConfig.responseJsonSchema.properties.tags.items.properties.tags.type).toBe("array")
  expect(request.systemInstruction.parts[0].text).toContain("Français (fr)")
  expect(JSON.parse(request.contents[0].parts[0].text)).toEqual(source.map(({ key, title }) => ({ key, title })))
})

test("normalizes case, Unicode and whitespace, and deduplicates within each collection", async () => {
  const source = collections("Mocassins été homme")
  mockResponse({ tags: [{ key: source[0].key, tags: [" Mocassins ", " E\u0301TE\u0301 ", " HOMME ", "été", "bleu   marine"] }] })
  expect(await proposeTags(source, "fr")).toEqual([{ key: source[0].key, tag: "mocassins, été, homme, bleu marine" }])
})

test("keeps repeated concepts between collections without inventing unique tags", async () => {
  const source = collections("Mocassins noirs femme", "Mocassins femme noir", "Nouveautés")
  mockResponse({ tags: [
    { key: source[0].key, tags: ["mocassins", "noir", "femme"] },
    { key: source[1].key, tags: ["mocassins", "noir", "femme"] },
    { key: source[2].key, tags: ["nouveautés"] },
  ] })
  const result = await proposeTags(source, "fr")
  expect(result[0].tag).toBe(result[1].tag)
  expect(result[2].tag).toBe("nouveautés")
})

test("applies the 100-character limit to each tag instead of the entire list", async () => {
  const source = collections("Long collection")
  const values = ["a".repeat(100), "b".repeat(100)]
  mockResponse({ tags: [{ key: source[0].key, tags: values }] })
  expect((await proposeTags(source))[0].tag).toBe(values.join(", "))
})

test.each([
  null,
  {},
  { tags: [] },
  { tags: [null] },
  { tags: [{ key: "unknown", tags: ["mocassins"] }] },
  { tags: [{ key: "collection-0", tags: ["mocassins"] }, { key: "collection-0", tags: ["homme"] }] },
  { tags: [{ key: "collection-0", tag: "mocassins beige homme" }] },
  { tags: [{ key: "collection-0", tags: [] }] },
  { tags: [{ key: "collection-0", tags: [4] }] },
  { tags: [{ key: "collection-0", tags: [""] }] },
  { tags: [{ key: "collection-0", tags: ["mocassins, homme"] }] },
  { tags: [{ key: "collection-0", tags: ["haut de gamme!"] }] },
  { tags: [{ key: "collection-0", tags: ["a".repeat(101)] }] },
  { tags: [{ key: "collection-0", tags: Array.from({ length: 61 }, (_, i) => `tag-${i}`) }] },
])("rejects malformed, incomplete or mismatched proposals: %j", async (value) => {
  mockResponse(value)
  await expect(proposeTags(collections("Mocassins beige homme"))).rejects.toThrow("invalide ou incomplète")
})

test("rejects an omitted collection even if the other entries are valid", async () => {
  mockResponse({ tags: [{ key: "collection-0", tags: ["mocassins", "beige"] }] })
  await expect(proposeTags(collections("Mocassins beige", "Mocassins noir"))).rejects.toThrow("invalide ou incomplète")
})

test("never accepts a truncated response even when its JSON parses", async () => {
  mockResponse({ tags: [{ key: "collection-0", tags: ["mocassins"] }] }, "MAX_TOKENS")
  await expect(proposeTags(collections("Mocassins"))).rejects.toThrow("invalide ou incomplète")
})

test("empty input does not call the provider", async () => {
  const fetchMock = mockResponse({ tags: [] })
  expect(await proposeTags([])).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})
