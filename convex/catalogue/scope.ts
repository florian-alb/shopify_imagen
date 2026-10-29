import { v } from "convex/values"

export type SourceScope = { path: string; language?: string; market?: string }
export const sourceScopeValidator = v.object({
  path: v.string(), language: v.optional(v.string()), market: v.optional(v.string()),
})

const locale = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?$/i

export function scopeFromPath(path: string): SourceScope {
  if (path === "") return { path: "" }
  if (!path.startsWith("/") || !locale.test(path.slice(1)))
    throw new Error("Marché ou langue source invalide.")
  const parts = path.slice(1).toLowerCase().split("-")
  const region = parts.find((part, i) => i > 0 && /^(?:[a-z]{2}|\d{3})$/.test(part))
  return {
    path: `/${parts.join("-")}`,
    language: (region ? parts.slice(0, -1) : parts).join("-"),
    ...(region ? { market: region.toUpperCase() } : {}),
  }
}

/** Locale prefixes advertised by Shopify, never a country inferred from a domain. */
export function urlScopePath(input: string, origin: string): string | null {
  try {
    const url = new URL(input, origin), base = new URL(origin)
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443"
      || url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return null
    const first = url.pathname.split("/")[1]
    return locale.test(first) ? scopeFromPath(`/${first}`).path : ""
  } catch { return null }
}

export function inSourceScope(input: string, origin: string, scope?: SourceScope) {
  return !scope || urlScopePath(input, origin) === scope.path
}

export function normalizeSourceScope(scope: SourceScope): SourceScope {
  const normalized = scopeFromPath(scope.path)
  if (normalized.path) return normalized
  if (scope.language && !/^[a-z]{2,3}(?:-[a-z]{4})?$/.test(scope.language))
    throw new Error("Langue source invalide.")
  return { path: "", ...(scope.language ? { language: scope.language } : {}) }
}
