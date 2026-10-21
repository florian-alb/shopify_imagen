import { getConvexSize } from "convex/values"
import type { CatalogProduct, MenuNode, ProductOverride } from "./source"
import { normalizeTag, validCollectionTag } from "./tags"
import type { ImportSelection } from "./importSelection"
export type { CatalogProduct, MenuNode, ProductOverride } from "./source"

export type Collection = {
  key: string
  url: string
  title: string
  description: string
  image: string | null
  tag: string
  validated: boolean
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
    const tag = normalizeTag(c.tag)
    if (!validCollectionTag(tag))
      throw new Error(`Tag invalide (minuscules, chiffres, espaces ou tirets, 100 caractères maximum) : ${c.title}`)
    if (seen.has(tag))
      throw new Error(`Tag utilisé par plusieurs collections : ${c.tag}`)
    seen.add(tag)
  }
}
export function effective(
  data: CatalogProduct,
  structure: Structure,
  override: ProductOverride = {},
) {
  const inherited = structure.collections
    .filter((c) => data.collections.includes(c.key))
    .map((c) => c.validated ? c.tag : c.appliedTag ?? "")
  return {
    ...data,
    title: override.title ?? data.title,
    tags: tags(override.tags ?? inherited),
    excluded: override.excluded ?? false,
    reviewed: override.reviewed ?? false,
  }
}
export function guardSize(value: unknown, limit = 900_000) {
  if (getConvexSize(JSON.parse(JSON.stringify(value))) > limit)
    throw new Error(
      "Données trop volumineuses pour une fiche Convex. Aucune donnée n’a été tronquée.",
    )
}
export function collectionMenu(nodes: MenuNode[], origin: string): MenuNode[] {
  return nodes.flatMap((node) => {
    const children = collectionMenu(node.children, origin)
    const url = node.url ? new URL(node.url, origin) : null
    const isCollection =
      url?.hostname.replace(/^www\./, "") ===
        new URL(origin).hostname.replace(/^www\./, "") &&
      /^\/collections\/[^/]+\/?$/.test(url.pathname)
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
