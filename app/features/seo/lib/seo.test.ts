import { describe, expect, test } from "vitest"
import { detectMapping, numericCell, prepareKeywords, suggestLanguage, type RawSheet } from "./import"
import { assignKeyword, mergeNodes } from "./editor"
import { exportTables, readWorkbook } from "./excel"
import { defaultConfig, type Keyword, type SeoDocument, type SeoNode } from "../types"

const keyword: Keyword = { key: "row-2", row: 2, keyword: "montessori spielzeug 1 jahr", intent: "n/a", volume: 2400, kd: 22, cpc: 0.22, raw: ["montessori spielzeug 1 jahr", "n/a", 2400] }
const node: SeoNode = { id: "one", parentId: null, title: "Spielzeug ab 1 Jahr", slug: "spielzeug-ab-1-jahr", kind: "collection", primaryKey: keyword.key,
  intent: "C", rationale: "Demande d’achat.", products: [], sourceIds: [], origin: "keywords", status: "pending", priorityOverride: null }
function document(): SeoDocument { return { nodes: [{ ...node }], assignments: [{ key: keyword.key, nodeId: node.id, relevance: "relevant", inferredIntent: "C", reason: "Jouets." }], sources: [], warnings: [] } }
describe("import et export SEO", () => {
  test("détecte les colonnes réelles de l’export et conserve une intention absente", () => {
    const sheet: RawSheet = { name: "Mots clés", headers: ["Mot clé", "Intention", "Volume", "KD %", "CPC (USD)", "Inconnue"],
      rows: [{ row: 2, values: ["montessori spielzeug", "n/a", 14800, 16, 0.2, "préserver"] }] }
    const mapping = detectMapping(sheet.headers), result = prepareKeywords(sheet, mapping)
    expect(result.keywords[0]).toMatchObject({ volume: 14800, intent: "n/a", kd: 16, cpc: 0.2, key: "row-2" })
    expect(result.keywords[0].raw[5]).toBe("préserver")
    expect(suggestLanguage(result.keywords)).toBe("de")
  })
  test("distingue zéro, n/a et nombre ambigu", () => {
    expect(numericCell(0)).toBe(0); expect(numericCell("n/a")).toBeNull(); expect(numericCell("0,22")).toBe(0.22)
    expect(() => numericCell("1,300")).toThrow("ambigu")
  })
  test("une métrique absente et les doublons sont signalés sans perdre de ligne", () => {
    const result = prepareKeywords({ name: "x", headers: ["Mot clé", "Volume"], rows: [
      { row: 2, values: ["jouet", 0] }, { row: 3, values: [" JOUET ", 100] }, { row: 4, values: ["bébé", "n/a"] },
    ] }, { keyword: 0, volume: 1, intent: -1, kd: -1, cpc: -1 })
    expect(result.keywords).toHaveLength(3); expect(result.warnings).toHaveLength(2)
  })
  test("l’exclusion enlève la référence principale et l’export contient la correction", () => {
    const changed = assignKeyword(document(), keyword.key, { relevance: "excluded", reason: "Hors offre." })
    expect(changed.nodes[0].primaryKey).toBeNull()
    expect(changed.assignments[0].nodeId).toBeNull()
    const tables = exportTables(changed, [keyword], defaultConfig, ["Mot clé", "Intention", "Volume"])
    expect(tables.Affectations[1]).toContain("Hors offre.")
    expect(tables.Affectations[1]).toContain("n/a")
    expect(tables.Arborescence[1][8]).toBeNull()
  })
  test("fusionne les affectations et refuse de fusionner un parent vers son enfant", () => {
    const d = document(); d.nodes.push({ ...node, id: "two", slug: "two", parentId: "one", primaryKey: null, origin: "ai" })
    expect(() => mergeNodes(d, "one", "two")).toThrow("descendants")
    const merged = mergeNodes(d, "two", "one")
    expect(merged.nodes).toHaveLength(1)
  })
  test("exporte le menu v2 avec ses mesures Excel et conserve les opportunités à part", () => {
    const d = document()
    d.analysisVersion = 2
    d.nodes.unshift({ ...node, id: "group", title: "Nach Alter", kind: "group", primaryKey: null, slug: "nach-alter", intent: "unknown" })
    d.nodes[1].parentId = "group"
    d.nodes[1].intent = "I"
    d.assignments[0].inferredIntent = "I"
    d.sources = [{ id: "fr", url: "https://example.com/", title: "Boutique française", kind: "menu", headings: [], links: [], error: null,
      menuStatus: "structured", language: "fr", extraction: "catalogue", menu: [{ key: "toys", title: "Jouets", url: "https://example.com/jouets", children: [
        { key: "age-one", title: "1 an", url: "https://example.com/jouets/1-an", children: [] },
      ] }] }]
    d.opportunities = [{ id: "outside", title: "Tour d’observation", rationale: "Produit présent chez le concurrent, absent de l’export.", products: ["Tour d’observation"], sourceIds: ["fr"] }]
    const tables = exportTables(d, [{ ...keyword, kd: 90 }], defaultConfig, ["Mot clé", "Intention", "Volume"])
    expect(tables.Arborescence[1].slice(8, 13)).toEqual([null, null, null, null, null])
    expect(tables.Arborescence[2][8]).toBe(2400)
    expect(tables.Arborescence[2][12]).toBe("P1")
    expect(tables.Arborescence.flat()).not.toContain("Tour d’observation")
    expect(tables.Opportunités?.[1]).toEqual(["outside", "Tour d’observation", d.opportunities[0].rationale, "Tour d’observation", "https://example.com/"])
    expect(tables.Opportunités?.[0]).not.toContain("Volume")
    expect(tables["Menus concurrents"]?.[2]).toEqual(["fr", "https://example.com/", "fr", "structured", "age-one", "toys", "1 an", "https://example.com/jouets/1-an", 1, "Jouets > 1 an"])
    expect(tables.Import[1]).toEqual([keyword.key, keyword.row, ...keyword.raw])
    expect(Object.keys(exportTables(document(), [keyword], defaultConfig, []))).toEqual(["Arborescence", "Affectations", "Sources", "Import", "Contexte"])
  })
  test("empêche une affectation ou une fusion de mots-clés vers un simple regroupement v2", () => {
    const d = document()
    d.analysisVersion = 2
    d.nodes.push({ ...node, id: "group", kind: "group", slug: "group", primaryKey: null })
    expect(() => assignKeyword(d, keyword.key, { nodeId: "group" })).toThrow("uniquement à une collection")
    expect(() => mergeNodes(d, "one", "group")).toThrow("autre collection")
    const moved = mergeNodes(d, "group", "one")
    expect(moved.assignments[0].nodeId).toBe("one")
  })
  test("lit un vrai classeur, et rejette les formules sans les exécuter", async () => {
    const { Workbook } = await import("exceljs"), w = new Workbook(), s = w.addWorksheet("Mots clés")
    s.addRows([["Mot clé", "Volume"], ["jouet", 100]])
    const data = await w.xlsx.writeBuffer()
    const file = { size: data.byteLength, arrayBuffer: async () => new Uint8Array(data).buffer }
    const result = await readWorkbook(file)
    expect(result[0].rows[0]).toEqual({ row: 2, values: ["jouet", 100] })
    s.getCell("B2").value = { formula: "1+1", result: 2 }
    const formulaData = await w.xlsx.writeBuffer()
    await expect(readWorkbook({ size: formulaData.byteLength, arrayBuffer: async () => new Uint8Array(formulaData).buffer })).rejects.toThrow("formule")
  })
})
