import { ConvexError, getConvexSize } from "convex/values"
import type { CatalogProduct, MenuNode, ProductOverride } from "./source"
import { collectionTagKey, collectionTagsError, parseCollectionTags } from "./tags"
import type { ImportSelection } from "./importSelection"
import { collectionKey } from "./source"
import { inSourceScope, type SourceScope } from "./scope"
export type { CatalogProduct, MenuNode, ProductOverride } from "./source"

export type Collection = {
  key: string
  url: string
  title: string
  description: string
  image: string | null
  tag: string // Comma-separated tags; a single tag remains compatible.
  validated: boolean
  ignored?: boolean
  appliedTag?: string
  edited?: boolean
  outsideMenu: boolean
  membership: "pending" | "complete" | "failed"
  count: number
  selectedCount: number
  error?: string
  targetId?: string
  targetHandle?: string
}
export type Structure = {
  menu: MenuNode[]
  collections: Collection[]
  warnings: string[]
  ranking?: { nextUrl?: string; rank: number }
}
export type Work = {
  kind: "discover" | "collect" | "add" | "export" | "import"
  phase: string
  url?: string
  maps?: string[]
  visited?: string[]
  offset?: number
  collection?: number
  cursor?: string
  rank?: number
  pageFingerprint?: string
  addition?: string
  generation?: number
  attempts?: number
  retryAt?: number
  shopId?: string
  importVersion?: number
  selection?: ImportSelection
  domain?: string
  currency?: string
  mappings?: Record<string, { id: string; handle: string }>
  bulk?: {
    token: string
    ids: string[]
    submittedAt: number
    id?: string
    resultOffset?: number
  }
  upload?: {
    id: string
    parts: Array<{ ETag: string; PartNumber: number }>
    count: number
  }
  summary?: {
    complete: number
    failed: number
    skipped: number
    created: number
    existing: number
  }
  menuId?: string
  allowPartial?: boolean
  passPending?: boolean
  replenish?: boolean
  sourceDelay?: number
}
export type RemoteResult = {
  shopId: string
  status: "pending" | "uncertain" | "verifying" | "complete" | "failed"
  id?: string
  handle?: string
  error?: string
  created?: boolean
  startedAt?: number
  catalogueVersion?: number
  importGeneration?: number
}
export const emptyStructure = (): Structure => ({
  menu: [],
  collections: [],
  warnings: [],
})
export const decode = <T>(value: string): T => JSON.parse(value) as T
export const encode = (value: unknown) => JSON.stringify(value)
export const tags = (values: string[]) =>
  [
    ...new Set(values.map((x) => x.normalize("NFC").trim()).filter(Boolean)),
  ].sort()
export const identity = (origin: string, id: string) =>
  `${new URL(origin).hostname.replace(/^www\./, "")}:${id}`
export function validateTags(collections: Collection[]) {
  const seen = new Set<string>()
  for (const c of collections) {
    if (c.ignored) continue
    const error = collectionTagsError(c.tag)
    if (error) throw new ConvexError(`Tags invalides pour ${c.title} : ${error}`)
    const key = collectionTagKey(c.tag)
    if (seen.has(key))
      throw new ConvexError(`Combinaison de tags utilisée par plusieurs collections : ${c.tag}`)
    seen.add(key)
  }
}
export function effective(
  data: CatalogProduct,
  structure: Structure,
  override: ProductOverride = {},
) {
  const inherited = structure.collections
    .filter((c) => !c.ignored && data.collections.includes(c.key))
    .flatMap((c) => parseCollectionTags(c.validated ? c.tag : c.appliedTag ?? ""))
  return {
    ...data,
    collections: includedCollectionKeys(data.collections, structure),
    title: override.title ?? data.title,
    tags: tags(override.tags ?? inherited),
    excluded: override.excluded ?? false,
    reviewed: override.reviewed ?? false,
  }
}
export function includedCollectionKeys(keys: string[], structure: Structure) {
  const ignored = new Set(structure.collections.filter((c) => c.ignored).map((c) => c.key))
  return keys.filter((key) => !ignored.has(key))
}

export function effectiveMenu(structure: Structure, origin: string): MenuNode[] {
  const ignored = new Set(structure.collections.filter((c) => c.ignored).map((c) => c.key))
  function walk(nodes: MenuNode[]): MenuNode[] {
    return nodes.flatMap((node) => {
      const children = walk(node.children)
      const key = node.url ? collectionKey(node.url, origin) : null
      const skip = key !== null && ignored.has(key)
      if (!children.length && (skip || (!node.url && node.children.length > 0))) return []
      return [{ ...node, url: skip ? null : node.url, children }]
    })
  }
  return walk(structure.menu)
}
export function guardSize(value: unknown, limit = 900_000) {
  if (getConvexSize(JSON.parse(JSON.stringify(value))) > limit)
    throw new Error(
      "Données trop volumineuses pour une fiche Convex. Aucune donnée n’a été tronquée.",
    )
}
export function collectionMenu(nodes: MenuNode[], origin: string, scope?: SourceScope): MenuNode[] {
  return nodes.flatMap((node) => {
    const children = collectionMenu(node.children, origin, scope)
    const url = node.url ? new URL(node.url, origin) : null
    const isCollection =
      url?.hostname.replace(/^www\./, "") ===
        new URL(origin).hostname.replace(/^www\./, "") &&
      !!collectionKey(url.href, origin) && inSourceScope(url.href, origin, scope)
    return isCollection || children.length
      ? [
          {
            ...node,
            url: isCollection
              ? `${origin}${url!.pathname}${url!.search}`
              : null,
            children,
          },
        ]
      : []
  })
}
export const phaseLabels: Record<string, string> = {
  menu: "Lecture du menu",
  sitemap: "Recherche des collections et produits",
  ranking: "Classement des produits",
  members: "Vérification des appartenances",
  tags: "Validation des tags",
  collect: "Collecte des fiches",
  ready: "Catalogue disponible",
  export: "Génération du fichier",
  setup: "Vérification de la destination",
  collections: "Création des collections",
  products: "Produits et images",
  results: "Vérification Shopify",
  links: "Adaptation des liens",
  finish: "Création du menu",
  summary: "Bilan de l’import",
}
