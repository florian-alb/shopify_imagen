export const CATALOG_VERSION = 1
export const PRODUCT_BATCH_SIZE = 25
export const BUCKET_COUNT = 256
export const MAX_STRUCTURE_BYTES = 300_000
export const MAX_COLLECTIONS = 500

// Leave room for JSON escaping and Convex's response envelope (1 MB limit).
export function validateStructureBudget(
  value: Pick<Preparation, "menu" | "collections">,
) {
  if (value.collections.length > MAX_COLLECTIONS)
    throw new Error(
      "Limite : 500 collections par export. Réduisez le périmètre du menu.",
    )
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    MAX_STRUCTURE_BYTES
  )
    throw new Error(
      "Structure trop volumineuse (300 Ko maximum). Réduisez le menu ou le contenu des collections.",
    )
  let count = 0
  const visit = (nodes: MenuNode[], depth: number) => {
    if (depth > 12) throw new Error("Menu trop profond (12 niveaux maximum).")
    for (const node of nodes) {
      if (++count > 1000)
        throw new Error("Menu trop volumineux (1 000 éléments maximum).")
      if (!node || !Array.isArray(node.children))
        throw new Error("Élément de menu invalide.")
      if (node.children.length) visit(node.children, depth + 1)
    }
  }
  visit(value.menu, 1)
}

export type MenuNode = {
  key: string
  title: string
  url: string | null
  children: MenuNode[]
}
export type CollectionPlan = {
  key: string
  url: string
  title: string
  targetTitle: string
  keyword: string
  description: string
  seoTitle: string
  seoDescription: string
  image: string | null
  selected: boolean
  tags: string[]
  match: "all" | "any"
  approved: boolean
  provenance: "source" | "ai" | "manual"
  minSizeCm?: number
}
export type ProductLink = { handle: string; url: string; collections: string[] }
export type Variant = {
  id: string
  title: string
  sku: string
  price: string
  currency: string
  compareAtPrice: string | null
  options: string[]
  weight: number
  weightUnit: string
  imageId: string | null
}
export type CatalogProduct = {
  key: string
  sourceId: string | null
  handle: string
  url: string
  title: string
  description: string
  vendor: string
  productType: string
  sourceTags: string[]
  options: Array<{ name: string; values: string[] }>
  variants: Variant[]
  images: Array<{ id: string; url: string; alt: string; position: number }>
  sections: Array<{ title: string; html: string }>
  seo: { title: string; description: string; canonical: string }
  collections: string[]
  jsonStatus: "complete" | "failed"
  htmlStatus: "complete" | "failed"
  errors: string[]
  warnings: string[]
  fetchedAt: number
}
export type ProductOverride = {
  title?: string
  tags?: string[]
  excluded?: boolean
  reviewed?: boolean
}
export type Preparation = {
  revision: number
  collections: CollectionPlan[]
  menu: MenuNode[]
  overrideBuckets?: Record<string, string>
}
export type PreparedProduct = CatalogProduct & {
  tags: string[]
  excluded: boolean
  reviewed: boolean
}
export type TaskKind =
  | "menu"
  | "discover"
  | "collection"
  | "sitemap"
  | "index"
  | "products"
  | "assemble"
  | "importSetup"
  | "importProducts"
  | "importLinks"
  | "importFinish"
export type TaskInput = {
  url?: string
  collection?: string
  page?: number
  seen?: string[]
  bucket?: number
  products?: ProductLink[]
  cursor?: string
  uploadId?: string
  part?: number
  count?: number
  started?: boolean
  byteCount?: number
  pendingKey?: string
  partial?: boolean
}
export type TaskSpec = { key: string; kind: TaskKind; inputKey: string }

export function sourceOrigin(input: string) {
  const url = new URL(
    input.includes("://") ? input.trim() : `https://${input.trim()}`,
  )
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Utilisez une adresse HTTPS publique sans identifiants ni port personnalisé.",
    )
  if (
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|test)$/.test(url.hostname)
  )
    throw new Error("Le domaine doit être public.")
  return url.origin
}

export function productLink(input: string, origin: string): ProductLink | null {
  try {
    const u = new URL(input, origin)
    if (
      u.hostname.replace(/^www\./, "") !==
      new URL(origin).hostname.replace(/^www\./, "")
    )
      return null
    const match = u.pathname.match(
      /\/(?:collections\/[^/]+\/)?products\/([^/]+)\/?$/,
    )
    if (!match) return null
    const handle = decodeURIComponent(match[1]).replace(/\.(?:json|js)$/, "")
    return {
      handle,
      url: `${origin}/products/${encodeURIComponent(handle)}`,
      collections: [],
    }
  } catch {
    return null
  }
}

export function collectionKey(input: string, origin: string) {
  try {
    const u = new URL(input, origin)
    if (
      u.hostname.replace(/^www\./, "") !==
      new URL(origin).hostname.replace(/^www\./, "")
    )
      return null
    const match = u.pathname.match(
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?collections\/([^/]+)\/?$/i,
    )
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function bucketFor(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0) % BUCKET_COUNT
}
export function safeKey(value: string) {
  return encodeURIComponent(value).replace(/\./g, "%2E")
}
export function normalizedTags(tags: string[]) {
  return [
    ...new Set(tags.map((t) => t.trim().normalize("NFC")).filter(Boolean)),
  ].sort()
}
export function mergeLinks(existing: ProductLink[], additions: ProductLink[]) {
  const map = new Map(
    existing.map((p) => [p.handle, { ...p, collections: [...p.collections] }]),
  )
  for (const p of additions) {
    const prior = map.get(p.handle)
    map.set(p.handle, {
      ...p,
      collections: [
        ...new Set([...(prior?.collections ?? []), ...p.collections]),
      ].sort(),
    })
  }
  return [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle))
}
export function prepareProduct(
  product: CatalogProduct,
  plans: CollectionPlan[],
  override: ProductOverride = {},
): PreparedProduct {
  const inherited = plans
    .filter(
      (p) => p.selected && p.approved && product.collections.includes(p.key),
    )
    .flatMap((p) => p.tags)
  const tags = normalizedTags(override.tags ?? inherited)
  const warnings = [...product.warnings]
  const sizes = product.variants.flatMap((v) =>
    v.options.flatMap((o) =>
      [...o.matchAll(/(\d+(?:[.,]\d+)?)\s*cm\b/gi)].map((m) =>
        Number(m[1].replace(",", ".")),
      ),
    ),
  )
  for (const p of plans.filter(
    (p) => p.minSizeCm && product.collections.includes(p.key),
  )) {
    if (!sizes.length || Math.max(...sizes) < p.minSizeCm!)
      warnings.push(
        `Taille à vérifier pour « ${p.targetTitle} » (${p.minSizeCm} cm minimum).`,
      )
  }
  return {
    ...product,
    title: override.title ?? product.title,
    tags,
    warnings: [...new Set(warnings)],
    excluded: override.excluded ?? false,
    reviewed: override.reviewed ?? false,
  }
}
export function matchesCollection(tags: string[], plan: CollectionPlan) {
  if (!plan.tags.length) return false
  return plan.match === "all"
    ? plan.tags.every((t) => tags.includes(t))
    : plan.tags.some((t) => tags.includes(t))
}
export function externalId(origin: string, sourceId: string) {
  return `${new URL(origin).hostname.replace(/^www\./, "")}:${sourceId}`
}
export function validatePlans(plans: CollectionPlan[]) {
  if (plans.length > MAX_COLLECTIONS)
    throw new Error("Limite : 500 collections par export.")
  if (new Set(plans.map((p) => p.key)).size !== plans.length)
    throw new Error("Chaque collection doit avoir une clé unique.")
  for (const p of plans) {
    if (
      !p ||
      typeof p.key !== "string" ||
      !/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,199}$/u.test(p.key) ||
      ["__proto__", "constructor", "prototype"].includes(p.key)
    )
      throw new Error("Clé de collection invalide.")
    for (const field of [
      "url",
      "title",
      "targetTitle",
      "keyword",
      "description",
      "seoTitle",
      "seoDescription",
    ] as const) {
      if (
        typeof p[field] !== "string" ||
        p[field].length > (field === "description" ? 100_000 : 2000)
      )
        throw new Error("Contenu de collection invalide.")
    }
    if (
      !Array.isArray(p.tags) ||
      p.tags.some((t) => typeof t !== "string") ||
      !["all", "any"].includes(p.match) ||
      typeof p.selected !== "boolean" ||
      typeof p.approved !== "boolean" ||
      !["source", "ai", "manual"].includes(p.provenance)
    )
      throw new Error("Règle de collection invalide.")
    if (
      p.minSizeCm !== undefined &&
      (!Number.isFinite(p.minSizeCm) || p.minSizeCm < 0)
    )
      throw new Error("Seuil de taille invalide.")
    if (!p.key || !p.targetTitle.trim())
      throw new Error("Une collection doit avoir une clé et un titre.")
    if (p.tags.length > 60 || p.tags.some((t) => !t.trim() || t.length > 100))
      throw new Error(
        "Tags invalides : 60 conditions maximum, 100 caractères par tag.",
      )
    if (p.approved && p.selected && !p.tags.length)
      throw new Error(
        `Ajoutez une règle à « ${p.targetTitle} » avant validation.`,
      )
  }
}
