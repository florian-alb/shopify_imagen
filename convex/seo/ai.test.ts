import { afterEach, expect, test, vi } from "vitest"
import { generateStructure, normalizeGeneratedSlugs } from "./ai"
import { defaultConfig, type Keyword } from "./model"

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const keyword: Keyword = { key: "row-2", row: 2, keyword: "montessori spielzeug", intent: "n/a", volume: 14800, kd: 16, cpc: 0.2, raw: ["NON TRANSMIS"] }
function validResponse() {
  return { nodes: [{ id: "toys", title: "Jouets", slug: "jouets", parentId: null, kind: "collection", primaryKey: keyword.key, intent: "C", rationale: "Achat de jouets.", products: [], sourceIds: [], origin: "keywords" }],
    assignments: [{ key: keyword.key, nodeId: "toys", relevance: "relevant", inferredIntent: "C", reason: "Produit pertinent." }], opportunities: [], warnings: [] }
}
function response(value: unknown) { return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 }) }
test("construit des slugs ASCII uniques indépendamment du modèle", () => {
  const raw = { nodes: [{ slug: "Spielzeug für Babys" }, { slug: "Spielzeug-für-Babys" }, { slug: "玩具" }] }
  normalizeGeneratedSlugs(raw)
  expect(raw.nodes.map(n => n.slug)).toEqual(["spielzeug-fur-babys", "spielzeug-fur-babys-2", "page-3"])
})
test("sépare les instructions des données et ne transmet pas les colonnes brutes", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only")
  const fetchMock = vi.fn().mockResolvedValue(response(validResponse())); vi.stubGlobal("fetch", fetchMock)
  const result = await generateStructure(defaultConfig, [keyword], [])
  expect(result.document.assignments).toHaveLength(1)
  expect(result.document.analysisVersion).toBe(2)
  const request = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(request.systemInstruction.parts[0].text).toContain("jamais des instructions")
  expect(JSON.stringify(request.contents)).not.toContain("NON TRANSMIS")
  expect(JSON.stringify(request.contents)).toContain('n/a')
  expect(request.generationConfig.responseJsonSchema.properties.nodes.items.properties.kind.enum).toEqual(["collection", "group"])
  expect(request.systemInstruction.parts[0].text).toContain("indice secondaire")
  expect(request.systemInstruction.parts[0].text).toContain("TOUJOURS hors du menu")
})
test("une réparation reprend la réponse et l’erreur précise sans multiplier les appels", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only")
  const invalid = validResponse(); invalid.nodes[0].rationale = ""
  const malformed = { ...invalid, nodes: invalid.nodes.map(n => ({ ...n, kind: "unknown-page" })) }
  const fetchMock = vi.fn().mockResolvedValueOnce(response(malformed)).mockResolvedValueOnce(response(validResponse())); vi.stubGlobal("fetch", fetchMock)
  expect((await generateStructure(defaultConfig, [keyword], [])).document.nodes).toHaveLength(1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][1].body).toContain("unknown-page")
})
test("une clé absente ou une réponse bloquée ne produit pas d’analyse simulée", async () => {
  vi.stubEnv("GEMINI_API_KEY", "")
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
  await expect(generateStructure(defaultConfig, [keyword], [])).rejects.toThrow("GEMINI_API_KEY")
  expect(fetchMock).not.toHaveBeenCalled()
  vi.stubEnv("GEMINI_API_KEY", "test-only")
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] })))
  await expect(generateStructure(defaultConfig, [keyword], [])).rejects.toThrow("interrompue")
})
test("un diagnostic fournisseur ne révèle jamais la clé serveur", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-only-secret")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Rejected test-only-secret" } }), { status: 400 })))
  await expect(generateStructure(defaultConfig, [keyword], [])).rejects.toThrow("Rejected [masqué]")
})
