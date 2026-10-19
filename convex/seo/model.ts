import { v, type Infer } from "convex/values"
import type { MenuNode } from "../catalogue/source"

export const MAX_KEYWORDS = 300
export const MAX_DOCUMENT_BYTES = 240_000
export const configValidator = v.object({
  theme: v.string(), sourceCountry: v.string(), sourceLanguage: v.string(),
  targetCountry: v.string(), targetLanguage: v.string(), scope: v.string(),
  competitors: v.array(v.string()), p1Volume: v.number(), p2Volume: v.number(), maxKd: v.number(),
})
export type SeoConfig = Infer<typeof configValidator>
export const cellValidator = v.union(v.string(), v.number(), v.boolean(), v.null())
export const keywordValidator = v.object({
  key: v.string(), row: v.number(), keyword: v.string(), intent: v.string(),
  volume: v.union(v.number(), v.null()), kd: v.union(v.number(), v.null()),
  cpc: v.union(v.number(), v.null()), raw: v.array(cellValidator),
})
export type Keyword = Infer<typeof keywordValidator>
export const pageKinds = ["home", "collection", "product_need", "guide", "filter", "group"] as const
export const intents = ["I", "C", "T", "N", "mixed", "unknown"] as const
export const relevanceKinds = ["relevant", "excluded", "review"] as const
export const defaultConfig: SeoConfig = {
  theme: "", sourceCountry: "", sourceLanguage: "de", targetCountry: "", targetLanguage: "de",
  scope: "Produits physiques pour enfants. Exclure les formations et services scolaires.",
  competitors: [], p1Volume: 1000, p2Volume: 100, maxKd: 35,
}
export type SeoNode = {
  id: string; parentId: string | null; title: string; kind: typeof pageKinds[number]; slug: string
  primaryKey: string | null; intent: typeof intents[number]; rationale: string
  products: string[]; sourceIds: string[]; origin: "keywords" | "competitor" | "ai"
  status: "pending" | "accepted" | "rejected"; priorityOverride: "P1" | "P2" | "P3" | null
}
export type Assignment = {
  key: string; nodeId: string | null; relevance: typeof relevanceKinds[number]
  inferredIntent: typeof intents[number]; reason: string
}
export type SourceObservation = {
  id: string; url: string; kind: string; title: string; headings: string[]
  links: Array<{ title: string; url: string }>; error: string | null
  menu?: MenuNode[]; menuStatus?: "structured" | "partial" | "unavailable"
  language?: string; extraction?: string
}
export type SeoOpportunity = {
  id: string; title: string; rationale: string; products: string[]; sourceIds: string[]
}
export type SeoDocument = {
  nodes: SeoNode[]; assignments: Assignment[]; sources: SourceObservation[]; warnings: string[]
  /** Absence preserves the historical, broader SEO analysis contract. */
  analysisVersion?: 2; opportunities?: SeoOpportunity[]
}

export function validateConfig(config: SeoConfig) {
  for (const key of ["theme", "sourceCountry", "sourceLanguage", "targetCountry", "targetLanguage", "scope"] as const)
    if (!config[key].trim() || config[key].length > 2000) throw new Error(`Champ requis ou trop long : ${key}.`)
  if (config.competitors.length > 3) throw new Error("Trois concurrents au maximum pour ce POC.")
  for (const value of config.competitors) {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443")
      throw new Error("Les concurrents doivent utiliser une URL HTTPS publique sans identifiants.")
  }
  if (![config.p1Volume, config.p2Volume, config.maxKd].every(Number.isFinite)
    || config.p2Volume < 0 || config.p1Volume < config.p2Volume || config.maxKd < 0 || config.maxKd > 100)
    throw new Error("Seuils de priorité invalides.")
}

/** New menu analyses use one measured market for both the export and the shop. */
export function validateMenuConfig(config: SeoConfig) {
  validateConfig(config)
  if (normalizeKeyword(config.sourceCountry) !== normalizeKeyword(config.targetCountry)
    || normalizeKeyword(config.sourceLanguage) !== normalizeKeyword(config.targetLanguage))
    throw new Error("Le pays et la langue de l’export doivent correspondre au marché de la boutique.")
}

export function normalizeKeyword(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
}
export function slugify(value: string) {
  return value.toLowerCase().replace(/ß/g, "ss").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
export function priorityFor(node: SeoNode, keywords: Keyword[], assignments: Assignment[], config: SeoConfig, analysisVersion: 1 | 2 = 1) {
  if (analysisVersion === 2 && node.kind === "group") return "P3"
  if (node.priorityOverride) return node.priorityOverride
  const attached = assignments.filter(a => a.nodeId === node.id && a.relevance === "relevant")
  if (analysisVersion === 2) {
    const primary = keywords.find(k => k.key === node.primaryKey && attached.some(a => a.key === k.key))
    if (node.kind !== "collection" || primary?.volume == null) return "P3"
    return primary.volume >= config.p1Volume ? "P1" : primary.volume >= config.p2Volume ? "P2" : "P3"
  }
  const commercial = attached.some(a => ["C", "T", "mixed"].includes(a.inferredIntent))
  const primary = keywords.find(k => k.key === node.primaryKey)
  if (!commercial || !["home", "collection", "product_need"].includes(node.kind) || primary?.volume == null) return "P3"
  if (primary.volume >= config.p1Volume && primary.kd != null && primary.kd <= config.maxKd) return "P1"
  return primary.volume >= config.p2Volume ? "P2" : "P3"
}
export function metricsFor(node: SeoNode, keywords: Keyword[], assignments: Assignment[], analysisVersion: 1 | 2 = 1) {
  if (analysisVersion === 2 && node.kind === "group") return { primaryVolume: null, declaredVolume: null, kd: null, cpc: null }
  const attached = assignments.filter(a => a.nodeId === node.id && (analysisVersion === 2 ? a.relevance === "relevant" : a.relevance !== "excluded"))
  const primary = keywords.find(k => k.key === node.primaryKey && (analysisVersion === 1 || attached.some(a => a.key === k.key)))
  // Exact duplicates are observations of the same query, never additive demand.
  const volumes = new Map<string, number>()
  for (const a of attached) {
    const k = keywords.find(k => k.key === a.key)
    if (k?.volume != null) volumes.set(normalizeKeyword(k.keyword), Math.max(volumes.get(normalizeKeyword(k.keyword)) ?? 0, k.volume))
  }
  return { primaryVolume: primary?.volume ?? null, declaredVolume: volumes.size ? [...volumes.values()].reduce((a, b) => a + b, 0) : null,
    kd: primary?.kd ?? null, cpc: primary?.cpc ?? null }
}
