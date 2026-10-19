"use node"
import { load } from "cheerio"
import { extractMenu } from "../catalogue/extract"
import { fetchPublic } from "../catalogue/network"
import type { MenuNode } from "../catalogue/source"
import type { SourceObservation } from "./model"

function navigationLinks(menu: MenuNode[]): SourceObservation["links"] {
  const links: SourceObservation["links"] = [], seen = new Set<string>()
  const walk = (nodes: MenuNode[]) => {
    for (const node of nodes) {
      if (node.url && !seen.has(node.url)) {
        seen.add(node.url)
        links.push({ title: node.title, url: node.url })
      }
      walk(node.children)
    }
  }
  walk(menu)
  return links
}

export function extractObservation(html: string, url: string, id: string): SourceObservation {
  const $ = load(html)
  $("script, style, noscript, iframe").remove()
  const { menu, navigationStatus } = extractMenu(html, url, { navigationOnly: true })
  const path = new URL(url).pathname
  const isProduct = $("[itemtype*='Product'], form[action*='/cart/add']").length > 0 || /\/products?\/|\/\d{4,}\/?$/.test(path)
  // Quick-add forms and product cards also occur on home/collection pages.
  const kind = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i.test(path) ? "home" : /\/collections?\//.test(path) ? "collection" : isProduct ? "product" : "page"
  return {
    id, url, kind, title: $("title").first().text().trim().slice(0, 250),
    headings: $("h1,h2").toArray().slice(0, 12).map(el => $(el).text().replace(/\s+/g, " ").trim().slice(0, 200)),
    links: navigationLinks(menu), menu, menuStatus: navigationStatus,
    language: ($("html").attr("lang") ?? "").slice(0, 40),
    extraction: navigationStatus === "structured"
      ? "Menu hiérarchique lu dans le HTML avec l’extracteur catalogue ; ordre et libellés source conservés."
      : navigationStatus === "partial"
        ? "Menu partiel : liens HTML à plat ou limite de taille atteinte. Des sous-menus chargés en JavaScript peuvent manquer."
        : "Aucun menu exploitable dans le HTML. Le menu peut nécessiter JavaScript ou une adaptation du thème.",
    error: null,
  }
}

const inaccessible = (url: string, id: string): SourceObservation => ({
  id, url, kind: "unknown", title: "", headings: [], links: [], menu: [], menuStatus: "unavailable", language: "",
  extraction: "La page n’a pas pu être lue. Aucun menu n’est supposé à partir de son adresse.",
  error: "Page inaccessible, adresse refusée ou délai dépassé.",
})

/** Entry page first, then the same locale's home and the domain home only when
 * needed. We fetch navigation HTML, never collection/product catalogues. */
export async function observeCompetitors(urls: string[]): Promise<SourceObservation[]> {
  const sources: SourceObservation[] = [], visited = new Set<string>()
  for (const input of urls) {
    const entry = new URL(input)
    entry.hash = ""
    const locale = entry.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i)?.[1]
    const candidates = [entry.href, ...(locale ? [new URL(`/${locale}/`, entry).href] : []), `${entry.origin}/`]
    for (const url of [...new Set(candidates)]) {
      if (visited.has(url)) continue
      visited.add(url)
      const id = `source-${sources.length + 1}`
      let observation: SourceObservation
      try { observation = extractObservation(await fetchPublic(url), url, id) }
      catch { observation = inaccessible(url, id) }
      sources.push(observation)
      if (observation.menuStatus === "structured") break
    }
  }
  return sources
}
