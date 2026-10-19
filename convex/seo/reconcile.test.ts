import { expect, test } from "vitest"
import { reconcileGenerated } from "./reconcile"
import type { Keyword } from "./model"

const keywords: Keyword[] = [{ key: "row-2", row: 2, keyword: "jouet", intent: "n/a", volume: 100, kd: 20, cpc: 0, raw: [] },
  { key: "row-3", row: 3, keyword: "école", intent: "C", volume: 1000, kd: null, cpc: null, raw: [] }]
const node = { id: "toys", title: "Jouets", slug: "jouets", kind: "collection", parentId: null, primaryKey: "unknown-key", intent: "C", rationale: "Jouets.", products: [], sourceIds: ["made-up"], origin: "keywords" }
test("une référence principale invalide est recalculée sans métrique inventée", () => {
  const result = reconcileGenerated({ nodes: [{ ...node }], assignments: [{ key: "row-2", nodeId: "toys", relevance: "relevant", inferredIntent: "C", reason: "Jouets." },
    { key: "row-3", nodeId: "toys", relevance: "excluded", inferredIntent: "C", reason: "École hors offre." }], warnings: [] }, keywords, [])
  expect(result.nodes[0].primaryKey).toBe("row-2")
  expect(result.nodes[0].sourceIds).toEqual([])
  expect(result.assignments[1].nodeId).toBeNull()
  expect(keywords[0].intent).toBe("n/a")
})
test("une ligne omise et une référence inconnue restent visibles à vérifier", () => {
  const result = reconcileGenerated({ nodes: [{ ...node }], assignments: [{ key: "row-2", nodeId: "unknown", relevance: "relevant", inferredIntent: "C", reason: "Jouets." }], warnings: [] }, keywords, [])
  expect(result.assignments).toHaveLength(2)
  expect(result.assignments.every(a => a.relevance === "review" && a.nodeId === null)).toBe(true)
  expect(result.nodes[0].origin).toBe("ai")
})

const source = { id: "source-1", url: "https://example.com", kind: "menu", title: "Menu concurrent", headings: [], links: [], error: null }
const productAssignment = { key: "row-2", nodeId: "toys", relevance: "relevant", inferredIntent: "I", reason: "Cette expression désigne des jouets à vendre malgré l’intention informationnelle." }
const schoolAssignment = { key: "row-3", nodeId: null, relevance: "excluded", inferredIntent: "C", reason: "Recherche d’établissement hors offre, malgré l’intention commerciale." }

test("v2 conserve le produit informationnel et exclut l’établissement sans blacklist de mots", () => {
  const result = reconcileGenerated({ nodes: [{ ...node }], assignments: [productAssignment, schoolAssignment], warnings: [] }, keywords, [], 2)
  expect(result.analysisVersion).toBe(2)
  expect(result.nodes[0]).toMatchObject({ kind: "collection", primaryKey: "row-2" })
  expect(result.assignments).toEqual([{ ...productAssignment, nodeId: "page-1" }, schoolAssignment])
  const schoolSupplies = [{ ...keywords[0], keyword: "matériel montessori pour école", intent: "I" }]
  expect(reconcileGenerated({ nodes: [{ ...node }], assignments: [productAssignment] }, schoolSupplies, [], 2).nodes).toHaveLength(1)
})
test("v2 place une catégorie concurrente non mesurée hors menu et normalise les opportunités", () => {
  const unsupported = { ...node, id: "tower", title: "Tours d’observation", slug: "tours", primaryKey: null, sourceIds: [source.id, "unseen"] }
  const result = reconcileGenerated({ nodes: [{ ...node }, unsupported], assignments: [productAssignment, schoolAssignment], opportunities: [{ id: "duplicate", title: "Mobilier", rationale: "Catégorie du concurrent absente de l’export.", products: ["Table"], sourceIds: [source.id], volume: 7000 }], warnings: [] }, keywords, [source], 2)
  expect(result.nodes).toHaveLength(1)
  expect(result.opportunities).toEqual([
    { id: "opportunity-1", title: "Mobilier", rationale: "Catégorie du concurrent absente de l’export.", products: ["Table"], sourceIds: [source.id] },
    { id: "opportunity-2", title: unsupported.title, rationale: unsupported.rationale, products: [], sourceIds: [source.id] },
  ])
  expect(result.opportunities?.some(opportunity => "volume" in opportunity)).toBe(false)
})
test("v2 conserve un parent utile uniquement comme regroupement sans volume", () => {
  const parent = { ...node, id: "parent", title: "Par âge", slug: "par-age", primaryKey: null, sourceIds: [source.id] }
  const result = reconcileGenerated({ nodes: [parent, { ...node, parentId: "parent" }], assignments: [productAssignment, schoolAssignment], warnings: [] }, keywords, [source], 2)
  expect(result.nodes).toHaveLength(2)
  expect(result.nodes[0]).toMatchObject({ kind: "group", primaryKey: null })
  expect(result.nodes[1].parentId).toBe(result.nodes[0].id)
  expect(result.assignments.some(assignment => assignment.nodeId === result.nodes[0].id)).toBe(false)
})
test("v2 n’invente aucune affectation pour une collection sans ligne pertinente", () => {
  const result = reconcileGenerated({ nodes: [{ ...node }], assignments: [{ ...productAssignment, relevance: "review" }, schoolAssignment], warnings: [] }, keywords, [], 2)
  expect(result.nodes).toEqual([])
  expect(result.opportunities).toEqual([])
  expect(result.assignments[0]).toMatchObject({ relevance: "review", nodeId: null })
})
test("v2 refuse un article au lieu de le convertir en collection", () => {
  expect(() => reconcileGenerated({ nodes: [{ ...node, kind: "guide" }], assignments: [productAssignment, schoolAssignment] }, keywords, [], 2)).toThrow("uniquement des collections")
})
test("v2 écarte les mots-clés inventés et les groupes sans collections", () => {
  const result = reconcileGenerated({ nodes: [{ ...node }, { ...node, id: "empty", kind: "group", primaryKey: null }], assignments: [productAssignment, schoolAssignment, { ...productAssignment, key: "made-up" }] }, keywords, [], 2)
  expect(result.nodes).toHaveLength(1)
  expect(result.assignments).toHaveLength(keywords.length)
  expect(result.warnings.join(" ")).toContain("absentes de l’Excel")
})
