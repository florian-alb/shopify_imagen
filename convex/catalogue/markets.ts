import { load } from "cheerio"
import { scopeFromPath, urlScopePath, type SourceScope } from "./scope"

export function discoverSourceScopes(xml: string, origin: string, html: string): SourceScope[] {
  const $ = load(xml, { xml: true })
  if (!$("sitemapindex, urlset").length) throw new Error("Sitemap XML invalide.")
  const paths = new Set<string>()
  $("sitemap > loc, url > loc").each((_, el) => {
    const url = $(el).text().trim()
    if (!/\/(?:sitemap_(?:products|collections)[^/]*|(?:products|collections)\/[^/]+)\/?(?:\?|$)/.test(url)) return
    const path = urlScopePath(url, origin)
    if (path !== null) paths.add(path)
  })
  if (!paths.size) throw new Error("Aucun sitemap de produits ou de collections détecté.")
  const language = load(html)("html").attr("lang")?.trim().toLowerCase()
  return [...paths].sort().map((path) => {
    const scope = scopeFromPath(path)
    // The home page identifies the default language, but does not prove a country.
    if (!path && language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language))
      scope.language = language.replace(/-(?:[a-z]{2}|\d{3})$/, "")
    return scope
  })
}

