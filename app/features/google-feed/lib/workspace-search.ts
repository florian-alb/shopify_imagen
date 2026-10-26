import type { FeedView } from "../types"

export type FeedSearch = {
  view: FeedView
  q?: string
  product?: string
  after?: string
  trail?: string[]
}

function id(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]{32}$/.test(value) ? value : undefined
}

export function validateFeedSearch(search: Record<string, unknown>): FeedSearch {
  const view =
    search.view === "ready" || search.view === "modified"
      ? "ready"
      : search.view === "errors"
        ? "errors"
        : "review"
  return {
    view,
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    product: id(search.product),
    after: id(search.after),
    trail: Array.isArray(search.trail)
      ? search.trail
          .filter((item): item is string => item === "" || Boolean(id(item)))
          .slice(0, 500)
      : undefined,
  }
}

export function nextFeedProduct(products: Array<{ id: string }>, selected?: string) {
  const index = products.findIndex((product) => product.id === selected)
  return products[index + 1]?.id ?? products.find((product) => product.id !== selected)?.id
}

export function readFeedReturnTo(value?: string): FeedSearch | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? validateFeedSearch(parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
