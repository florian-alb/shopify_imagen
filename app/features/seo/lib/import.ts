import { MAX_KEYWORDS, normalizeKeyword, type Keyword } from "../../../../convex/seo/model"

export type RawSheet = { name: string; headers: string[]; rows: Array<{ row: number; values: Array<string | number | boolean | null> }> }
export type ColumnMapping = { keyword: number; intent: number; volume: number; kd: number; cpc: number }
const columnAliases = {
  keyword: ["mot cle", "keyword", "mot-cle"], intent: ["intention", "intent"],
  volume: ["volume", "search volume"], kd: ["kd %", "keyword difficulty", "kd"], cpc: ["cpc (usd)", "cpc"],
}
const normalizedHeader = (value: string) => normalizeKeyword(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
export function detectMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(Object.entries(columnAliases).map(([key, names]) => [key, headers.findIndex(h => names.includes(normalizedHeader(h))) ])) as ColumnMapping
}
export function numericCell(value: string | number | boolean | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value !== "string" || !value.trim() || /^(n\/?a|—|-)$/i.test(value.trim())) return null
  const raw = value.trim().replace(/[\s\u00a0\u202f]/g, "")
  // Do not guess whether an ambiguous thousands separator is a decimal separator.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(`Nombre ambigu « ${value} » : utilisez un nombre Excel ou une valeur sans séparateur de milliers.`)
  return Number(raw.replace(",", "."))
}
export function prepareKeywords(sheet: RawSheet, mapping: ColumnMapping) {
  if (mapping.keyword < 0) throw new Error("Associez la colonne contenant les mots-clés.")
  const used = Object.values(mapping).filter(n => n >= 0)
  if (new Set(used).size !== used.length || used.some(n => n >= sheet.headers.length)) throw new Error("Chaque champ doit utiliser une colonne distincte.")
  const warnings: string[] = [], seen = new Map<string, Keyword>(), keywords: Keyword[] = []
  for (const { row, values } of sheet.rows) {
    const keyword = String(values[mapping.keyword] ?? "").trim()
    if (!keyword) { warnings.push(`Ligne ${row} ignorée : mot-clé vide.`); continue }
    const number = (column: number) => column < 0 ? null : numericCell(values[column] ?? null)
    const item: Keyword = { key: `row-${row}`, row, keyword, intent: mapping.intent < 0 ? "" : String(values[mapping.intent] ?? ""),
      volume: number(mapping.volume), kd: number(mapping.kd), cpc: number(mapping.cpc), raw: values }
    const previous = seen.get(normalizeKeyword(keyword))
    if (previous) warnings.push(`Lignes ${previous.row} et ${row} : doublon${previous.volume !== item.volume ? " avec volumes différents" : ""}. Conservé pour vérification, volume non additionné.`)
    else seen.set(normalizeKeyword(keyword), item)
    if (item.volume === null) warnings.push(`Ligne ${row} : volume absent.`)
    keywords.push(item)
  }
  if (!keywords.length || keywords.length > MAX_KEYWORDS) throw new Error(`Le POC accepte entre 1 et ${MAX_KEYWORDS} mots-clés.`)
  return { keywords, warnings }
}
export function suggestLanguage(keywords: Keyword[]): string {
  const text = keywords.map(k => k.keyword.toLowerCase()).join(" ")
  const german = /\b(spielzeug|schule|kindergarten|vorschule|jahr|jahre|monate|übungen|arbeitsblätter)\b/.test(text)
  const french = /\b(jouets?|école|mois|enfants?|apprentissage)\b/.test(text)
  return german ? "de" : french ? "fr" : ""
}
