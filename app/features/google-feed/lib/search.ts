export type GoogleFeedCatalogSearch = {
  view: "all" | "incomplete" | "conflicts" | "modified"
  q?: string
  productType?: string
  collection?: string
  shopifyStatus?: string
  gender?: string
  ageGroup?: string
  page: number
  size: 20 | 50
}

export type GoogleFeedPreviewSearch = {
  status: "all" | "ready" | "conflict" | "invalid" | "excluded"
  page: number
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function validateGoogleFeedCatalogSearch(
  search: Record<string, unknown>,
): GoogleFeedCatalogSearch {
  const allowedViews = ["all", "incomplete", "conflicts", "modified"] as const
  const view = allowedViews.includes(search.view as (typeof allowedViews)[number])
    ? (search.view as GoogleFeedCatalogSearch["view"])
    : "all"
  const size = Number(search.size) === 50 ? 50 : 20
  const q = typeof search.q === "string" && search.q.trim() ? search.q : undefined
  const optionalString = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : undefined
  return {
    view,
    q,
    productType: optionalString(search.productType),
    collection: optionalString(search.collection),
    shopifyStatus: optionalString(search.shopifyStatus),
    gender: optionalString(search.gender),
    ageGroup: optionalString(search.ageGroup),
    page: positiveInteger(search.page, 1),
    size,
  }
}

export function validateGoogleFeedPreviewSearch(
  search: Record<string, unknown>,
): GoogleFeedPreviewSearch {
  const allowed = ["all", "ready", "conflict", "invalid", "excluded"] as const
  const status = allowed.includes(search.status as (typeof allowed)[number])
    ? (search.status as GoogleFeedPreviewSearch["status"])
    : "all"
  return { status, page: positiveInteger(search.page, 1) }
}
