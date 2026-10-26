export type GoogleFeedPreviewSearch = {
  status: "all" | "ready" | "conflict" | "invalid" | "excluded"
  page: number
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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
