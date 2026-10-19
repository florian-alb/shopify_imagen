/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import workflowTest from "@convex-dev/workflow/test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { api, internal } from "../_generated/api"
import { defaultConfig, type Keyword, type SeoDocument } from "./model"

vi.mock("./competitors", () => ({ observeCompetitors: async () => [{ id: "source-1", url: "https://example.com", kind: "home", title: "Source", headings: [], links: [], error: null }] }))
vi.mock("./ai", () => ({ generateStructure: async (_config: unknown, keywords: Keyword[], sources: SeoDocument["sources"]) => ({ model: "test-only", document: {
  analysisVersion: 2, opportunities: [],
  nodes: [{ id: "one", parentId: null, title: "Spielzeug ab 1 Jahr", slug: "spielzeug-ab-1-jahr", kind: "collection", primaryKey: "row-2", intent: "C", rationale: "Achat de jouets.", products: [], sourceIds: ["source-1"], origin: "keywords", status: "pending", priorityOverride: null }],
  assignments: keywords.map(k => ({ key: k.key, nodeId: k.key === "row-2" ? "one" : null, relevance: k.key === "row-2" ? "relevant" : "excluded", inferredIntent: k.key === "row-2" ? "C" : "I", reason: k.key === "row-2" ? "Jouets." : "Recherche d’école hors offre." })), sources, warnings: [],
} }) }))
const modules = import.meta.glob("../**/*.ts")
const config = { ...defaultConfig, theme: "Montessori", sourceCountry: "Allemagne", targetCountry: "Allemagne" }
const keywords: Keyword[] = [
  { key: "row-2", row: 2, keyword: "montessori spielzeug 1 jahr", intent: "n/a", volume: 2400, kd: 22, cpc: 0.22, raw: ["montessori spielzeug 1 jahr"] },
  { key: "row-3", row: 3, keyword: "montessori schule", intent: "C", volume: 4400, kd: 39, cpc: 1.06, raw: ["montessori schule"] },
]
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
async function setup() {
  const t = convexTest(schema, modules); workflowTest.register(t)
  const owner = await t.run(ctx => ctx.db.insert("users", { approvalStatus: "approved" }))
  const other = await t.run(ctx => ctx.db.insert("users", { approvalStatus: "approved" }))
  const user = t.withIdentity({ subject: owner }), stranger = t.withIdentity({ subject: other })
  const id = await user.mutation(api.seoProjects.create, { config, filename: "Montessori.xlsx", headers: ["Mot clé"], keywords })
  return { t, user, stranger, id }
}
test("l’import est privé : utilisateur absent, non approuvé et autre propriétaire refusés", async () => {
  const { t, user, stranger, id } = await setup()
  await expect(t.query(api.seoProjects.workspace, { id })).rejects.toThrow("Authentication")
  await expect(stranger.query(api.seoProjects.workspace, { id })).rejects.toThrow("introuvable")
  await expect(stranger.mutation(api.seoProjects.generate, { id, config })).rejects.toThrow("introuvable")
  expect(await stranger.query(api.seoProjects.list, {})).toHaveLength(0)
  const pendingId = await t.run(ctx => ctx.db.insert("users", { approvalStatus: "pending" }))
  await expect(t.withIdentity({ subject: pendingId }).query(api.seoProjects.list, {})).rejects.toThrow("approval")
  expect((await user.query(api.seoProjects.workspace, { id })).keywords).toHaveLength(2)
})
test("génération, correction, version distincte, contrôle de révision et sources immuables", async () => {
  const { t, user, stranger, id } = await setup()
  const versionId = await user.mutation(api.seoProjects.generate, { id, config })
  await expect(user.mutation(api.seoProjects.generate, { id, config })).rejects.toThrow("déjà")
  await t.action(internal.seoActions.analyze, { versionId })
  let workspace = await user.query(api.seoProjects.workspace, { id })
  expect(workspace.versions[0].status).toBe("ready")
  const d: SeoDocument = JSON.parse((await user.query(api.seoProjects.version, { id: workspace.versions[0]._id })).workingJson!)
  expect(d.analysisVersion).toBe(2)
  expect(d.assignments[1]).toMatchObject({ relevance: "excluded", nodeId: null })
  d.nodes[0].title = "Correction manuelle"
  d.sources[0].url = "https://forged.example"
  const args = { versionId, revision: 0, documentJson: JSON.stringify(d) }
  await expect(stranger.mutation(api.seoProjects.save, args)).rejects.toThrow("introuvable")
  expect(await user.mutation(api.seoProjects.save, args)).toBe(1)
  await expect(user.mutation(api.seoProjects.save, args)).rejects.toThrow("a changé")
  workspace = await user.query(api.seoProjects.workspace, { id })
  expect(JSON.parse((await user.query(api.seoProjects.version, { id: workspace.versions[0]._id })).workingJson!).sources[0].url).toBe("https://example.com")
  expect(JSON.parse((await user.query(api.seoProjects.version, { id: workspace.versions[0]._id })).originalJson!).nodes[0].title).toBe("Spielzeug ab 1 Jahr")
  const nextId = await user.mutation(api.seoProjects.generate, { id, config: { ...config, scope: "Jouets physiques pour enfants de 0 à 3 ans, hors services scolaires." } })
  await t.action(internal.seoActions.analyze, { versionId: nextId })
  workspace = await user.query(api.seoProjects.workspace, { id })
  expect(workspace.versions).toHaveLength(2)
  expect(JSON.parse((await user.query(api.seoProjects.version, { id: versionId })).workingJson!).nodes[0].title).toBe("Correction manuelle")
  expect(JSON.parse((await user.query(api.seoProjects.version, { id: workspace.versions[0]._id })).workingJson!).warnings.join(" ")).toContain("hors du menu")
  expect(workspace.keywords[0].intent).toBe("n/a")
})
test("le marché reste commun et une sauvegarde ne peut pas désactiver le contrat marchand", async () => {
  const { t, user, id } = await setup()
  await expect(user.mutation(api.seoProjects.generate, { id, config: { ...config, targetCountry: "France" } })).rejects.toThrow("marché")
  const versionId = await user.mutation(api.seoProjects.generate, { id, config })
  await t.action(internal.seoActions.analyze, { versionId })
  const version = await user.query(api.seoProjects.version, { id: versionId })
  expect(version.analysisVersion).toBe(2)
  const document: SeoDocument = JSON.parse(version.workingJson!)
  delete document.analysisVersion
  document.nodes[0].kind = "guide"
  await expect(user.mutation(api.seoProjects.save, { versionId, revision: 0, documentJson: JSON.stringify(document) })).rejects.toThrow("méthode")
  document.analysisVersion = 2
  await expect(user.mutation(api.seoProjects.save, { versionId, revision: 0, documentJson: JSON.stringify(document) })).rejects.toThrow("collections")
})
test("une ancienne version garde ses guides, sa méthode et ses corrections", async () => {
  const { t, user, id } = await setup()
  const historical: SeoDocument = {
    nodes: [{ id: "guide", parentId: null, title: "Historique", slug: "historique", kind: "guide", primaryKey: null,
      intent: "I", rationale: "Contrat historique.", products: [], sourceIds: [], origin: "ai", status: "pending", priorityOverride: null }],
    assignments: keywords.map(keyword => ({ key: keyword.key, nodeId: null, relevance: "excluded", inferredIntent: "unknown", reason: "Historique." })),
    sources: [], warnings: [],
  }
  const originalJson = JSON.stringify(historical)
  const versionId = await t.run(ctx => ctx.db.insert("seoVersions", { projectId: id, config, status: "ready", revision: 0, originalJson, workingJson: originalJson,
    model: "historical", createdAt: 1, updatedAt: 1 }))
  historical.nodes[0].title = "Correction historique"
  await user.mutation(api.seoProjects.save, { versionId, revision: 0, documentJson: JSON.stringify(historical) })
  const saved = await user.query(api.seoProjects.version, { id: versionId })
  expect(saved.analysisVersion).toBeUndefined()
  expect(saved.originalJson).toBe(originalJson)
  expect(JSON.parse(saved.workingJson!).nodes[0]).toMatchObject({ kind: "guide", title: "Correction historique" })
})
test("une réponse IA incomplète est refusée et un échec conserve l’import", async () => {
  const { t, user, id } = await setup()
  const versionId = await user.mutation(api.seoProjects.generate, { id, config })
  await expect(t.mutation(internal.seoProjects.complete, { versionId, documentJson: JSON.stringify({ nodes: [], assignments: [], sources: [], warnings: [] }), model: "test" })).rejects.toThrow()
  await t.mutation(internal.seoProjects.fail, { versionId, error: "Erreur IA" })
  const w = await user.query(api.seoProjects.workspace, { id })
  expect(await user.query(api.seoProjects.version, { id: versionId })).toMatchObject({ status: "failed", error: "Erreur IA" })
  expect(w.keywords).toHaveLength(2)
})
test("le workflow enregistré exécute le worker et atteint son état final", async () => {
  const { t, user, id } = await setup()
  const versionId = await user.mutation(api.seoProjects.generate, { id, config })
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  const version = await user.query(api.seoProjects.version, { id: versionId })
  expect(version.status).toBe("ready")
  expect(JSON.parse(version.workingJson!).assignments).toHaveLength(2)
})
