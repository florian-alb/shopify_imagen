import type { CellValue } from "exceljs"
import { MAX_KEYWORDS, metricsFor, priorityFor, type Keyword, type SeoConfig, type SeoDocument, type SourceObservation } from "../../../../convex/seo/model"
import type { RawSheet } from "./import"

function cell(value: CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Date) return value.toISOString()
  if ("formula" in value || "sharedFormula" in value) throw new Error("Cet import contient une formule. Exportez les cellules en valeurs avant de les importer.")
  if ("richText" in value) return value.richText.map(part => part.text).join("")
  if ("text" in value) return value.text
  if ("error" in value) return value.error
  return null
}
export async function readWorkbook(file: Pick<File, "size" | "arrayBuffer">): Promise<RawSheet[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Fichier limité à 5 Mo pour ce POC.")
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  if (workbook.worksheets.length > 10) throw new Error("Dix onglets au maximum pour ce POC.")
  return workbook.worksheets.filter(s => s.rowCount > 0).map(sheet => {
    if (sheet.rowCount > MAX_KEYWORDS + 1 || sheet.columnCount > 60) throw new Error(`L’onglet ${sheet.name} dépasse ${MAX_KEYWORDS} lignes de données ou 60 colonnes.`)
    const width = sheet.columnCount
    const headers = Array.from({ length: width }, (_, i) => String(cell(sheet.getRow(1).getCell(i + 1).value) ?? `Colonne ${i + 1}`))
    const rows: RawSheet["rows"] = []
    sheet.eachRow((row, index) => {
      if (index > 1) rows.push({ row: index, values: Array.from({ length: width }, (_, i) => cell(row.getCell(i + 1).value)) })
    })
    return { name: sheet.name, headers, rows }
  })
}

function exportMenuRows(sources: SourceObservation[]) {
  const rows: Array<Array<string | number | null>> = []
  function visit(source: SourceObservation, entries: NonNullable<SourceObservation["menu"]>, parentKey: string | null, path: string[]) {
    for (const entry of entries) {
      const currentPath = [...path, entry.title]
      rows.push([source.id, source.url, source.language ?? null, source.menuStatus ?? null, entry.key, parentKey, entry.title, entry.url, path.length, currentPath.join(" > ")])
      visit(source, entry.children, entry.key, currentPath)
    }
  }
  for (const source of sources) visit(source, source.menu ?? [], null, [])
  return rows
}

export function exportTables(document: SeoDocument, keywords: Keyword[], config: SeoConfig, headers: string[]) {
  const nodes = new Map(document.nodes.map(n => [n.id, n]))
  const analysisVersion = document.analysisVersion ?? 1
  const collectionMenu = analysisVersion === 2
  return {
    Arborescence: [
      ["ID", "Parent", "Nom", "Type", "Slug", "Mot-clé principal", "Mots-clés secondaires", "Intention IA", "Volume principal source", "Somme des volumes déclarés", "KD SEO", "CPC USD", "Priorité", "Statut", "Origine", "Justification", "Produits à sourcer", "Sources", "Pays source", "Pays cible", "Langue cible"],
      ...document.nodes.map(n => {
        const metrics = metricsFor(n, keywords, document.assignments, analysisVersion)
        return [n.id, n.parentId, n.title, n.kind, collectionMenu && n.kind === "group" ? null : n.slug, keywords.find(k => k.key === n.primaryKey)?.keyword ?? null,
          document.assignments.filter(a => a.nodeId === n.id && a.key !== n.primaryKey).map(a => keywords.find(k => k.key === a.key)?.keyword).join(" | "),
          n.intent, metrics.primaryVolume, metrics.declaredVolume, metrics.kd, metrics.cpc, collectionMenu && n.kind === "group" ? null : priorityFor(n, keywords, document.assignments, config, analysisVersion), n.status, n.origin, n.rationale,
          n.products.join(" | "), n.sourceIds.map(id => document.sources.find(s => s.id === id)?.url).join(" | "), config.sourceCountry, config.targetCountry, config.targetLanguage]
      }),
    ],
    Affectations: [["ID source", "Ligne Excel", "Mot-clé", "Intention source", "Intention IA", "Pertinence", "Page", "Raison", "Volume source", "KD SEO", "CPC USD"],
      ...document.assignments.map(a => {
        const k = keywords.find(k => k.key === a.key)!
        return [k.key, k.row, k.keyword, k.intent, a.inferredIntent, a.relevance, a.nodeId ? nodes.get(a.nodeId)?.title : null, a.reason, k.volume, k.kd, k.cpc]
      })],
    Sources: [["ID", "URL consultée", "Type", "Titre", "Erreur", "État du menu", "Langue observée", "Méthode d’extraction"],
      ...document.sources.map(s => [s.id, s.url, s.kind, s.title, s.error, s.menuStatus ?? null, s.language ?? null, s.extraction ?? null])],
    Import: [["ID source", "Ligne Excel", ...headers], ...keywords.map(k => [k.key, k.row, ...k.raw])],
    Contexte: [["Paramètre", "Valeur"], ["Thématique", config.theme], ["Pays source", config.sourceCountry], ["Langue source", config.sourceLanguage],
      ["Pays cible", config.targetCountry], ["Langue cible", config.targetLanguage], ["Périmètre", config.scope],
      ["Méthode", collectionMenu ? "Menu de collections fondé sur l’Excel (v2)" : "Arborescence historique (v1)"],
      ["Seuil P1", config.p1Volume], ["Seuil P2", config.p2Volume],
      ...(!collectionMenu ? [["KD maximum P1", config.maxKd]] : [["Priorités", "Volume principal uniquement ; intention et KD indicatifs."], ["Opportunités", "Hors du menu, sans mot-clé ni volume inventé."]]),
      ...document.warnings.map(w => ["Limite", w])],
    ...(collectionMenu ? {
      Opportunités: [["ID", "Catégorie hors menu", "Justification", "Produits à étudier", "Sources concurrentes"],
        ...(document.opportunities ?? []).map(opportunity => [opportunity.id, opportunity.title, opportunity.rationale, opportunity.products.join(" | "),
          opportunity.sourceIds.map(id => document.sources.find(source => source.id === id)?.url).filter(Boolean).join(" | ")])],
      "Menus concurrents": [["Source", "URL consultée", "Langue observée", "État du menu", "Clé", "Clé parent", "Libellé original", "URL catégorie", "Profondeur", "Chemin original"],
        ...exportMenuRows(document.sources)],
    } : {}),
  }
}
export async function buildExcel(document: SeoDocument, keywords: Keyword[], config: SeoConfig, headers: string[]) {
  const { default: ExcelJS } = await import("exceljs"), workbook = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(exportTables(document, keywords, config, headers))) {
    const sheet = workbook.addWorksheet(name)
    sheet.addRows(rows)
    sheet.views = [{ state: "frozen", ySplit: 1 }]
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183B38" } }
    sheet.columns.forEach(column => { column.width = 24 })
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: rows[0].length } }
  }
  return workbook.xlsx.writeBuffer()
}
export function downloadBlob(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), link = window.document.createElement("a")
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
