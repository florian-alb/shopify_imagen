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
export type ProductLink = {
  handle: string
  url: string
  collections: string[]
}
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
  contentLanguage?: string
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

export const safeKey = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 120)
