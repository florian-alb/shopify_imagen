import { load } from "cheerio"
import { collectionKey, safeKey, type MenuNode } from "./source"

export type NavigationStatus = "structured" | "partial" | "unavailable"
const catalogueSelectors = "header nav, header [role=navigation], .header__inline-menu, header-menu, .mega-menu, #shopify-section-header nav, nav[aria-label], .menu-drawer__navigation"
const generalSelectors = `${catalogueSelectors}, nav, [role=navigation], .main-navigation, .navigation-main, .main-menu, #main-menu, .primary-menu, .menu-principal, .elementor-nav-menu, .navigation-flyout`
const technicalPath = /\/(?:accounts?|cart|checkout|search|blogs?|journal|articles?|contact|pages\/(?:contact|about|faq|privacy|terms|shipping|returns)|policies)(?:\/|$)/i
const technicalTitle = /^(?:accueil|home|startseite|blog|journal|contact(?:ez-nous)?|kontakt|mon compte|mein konto|account|connexion|login|panier|warenkorb|cart|checkout|recherche|search|suche|faq|aide|help|über uns|about us|à propos|livraison|shipping|versand|retours|returns|datenschutz|impressum|mentions légales|newsletter)$/i

/** The catalogue and SEO use the same HTML tree reader. General mode retains
 * category routes from other commerce platforms instead of requiring Shopify. */
export function extractNavigation(html: string, origin: string, general = false): { menu: MenuNode[]; status: NavigationStatus } {
  const $ = load(html)
  $("script, style, noscript, iframe").remove()
  const absolute = (value: string | undefined) => {
    if (!value || value.startsWith("#")) return null
    try {
      const url = new URL(value, origin)
      if (!/^https?:$/.test(url.protocol)) return null
      if (general) {
        const base = new URL(origin)
        if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443"
          || url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return null
        url.hash = ""
        for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/.test(key)) url.searchParams.delete(key)
        if (url.href.length > 1000) return null
      }
      return url.href
    } catch { return null }
  }
  const titleOf = (element: ReturnType<typeof $>) => {
    const label = element.clone()
    label.find("svg,ul,ol,.icon,.material-symbols-outlined").remove()
    return label.text().replace(/keyboard_arrow_down|expand_more/g, "").replace(/\s+/g, " ").trim().slice(0, general ? 180 : undefined)
  }
  function nodes(root: ReturnType<typeof $>, depth: number): MenuNode[] {
    if (depth > 12) return []
    const list = root.is("ul,ol") ? root : root.find("ul,ol").first()
    if (!list.length) {
      // Shopware/Bootstrap flyouts keep the category hierarchy in nested divs
      // inside each top-level LI, instead of nested UL elements.
      const flyout = general
        ? root.is(".navigation-flyout-categories") ? root : root.find(".navigation-flyout-categories").first()
        : $([])
      return flyout.children().toArray().map((el, index) => {
        const item = $(el), label = item.is("a") ? item : item.children("a,button,summary").first()
        const title = titleOf(label)
        return { key: `${depth}-${index}-${safeKey(title)}`, title, url: absolute(label.attr("href")), children: nodes(item, depth + 1) }
      }).filter(node => node.title)
    }
    return list.children("li").toArray().map((li, index) => {
      const item = $(li), label = item.find("a, summary, button").first()
      const title = titleOf(label)
      return { key: `${depth}-${index}-${safeKey(title)}`, title, url: absolute(label.attr("href")), children: nodes(item, depth + 1) }
    }).filter(node => node.title)
  }
  function customNodes(root: ReturnType<typeof $>): MenuNode[] {
    return root.children("a, dropdown-component, .header__submenu-item").toArray().map((el, i) => {
      const item = $(el), label = item.is("a") ? item : item.find("button, summary, a").first()
      const childRoot = item.find(".header__subsubmenu, .dropdown-content").first()
      return { key: String(i), title: titleOf(label), url: absolute(label.attr("href")), children: childRoot.length ? customNodes(childRoot) : [] }
    }).filter(node => node.title)
  }
  const clean = (items: MenuNode[]): MenuNode[] => items.flatMap(item => {
    const children = clean(item.children)
    const url = item.url
    const technical = technicalTitle.test(item.title) || url && (technicalPath.test(new URL(url).pathname) || !new URL(url).pathname.replace(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i, ""))
    // A technical or off-site parent can still carry useful category children.
    if (technical) return children
    if (!url && !children.length) return []
    return [{ ...item, url, children }]
  })
  const score = (items: MenuNode[]): number => items.reduce((n, item) => n
    + (item.url && collectionKey(item.url, origin) ? general ? 3 : 1 : general && item.url ? 1 : 0)
    + (general && item.children.length ? 1 : 0) + score(item.children), 0)
  let best: MenuNode[] = [], structured = false
  for (const candidate of $(general ? generalSelectors : catalogueSelectors).toArray()) {
    let result = nodes($(candidate), 0)
    if (general) result = clean(result)
    if (score(result) > score(best)) { best = result; structured = true }
  }
  const desktop = $("header .header__menu-desktop-list").first()
  if (desktop.length) {
    const result = general ? clean(customNodes(desktop)) : customNodes(desktop)
    if (score(result) >= score(best)) { best = result; structured = true }
  }
  if (!best.length) {
    const selectors = general ? `${generalSelectors.split(",").map(selector => `${selector.trim()} a[href]`).join(",")}, header a[href]` : "header a[href*='/collections/'], [role=navigation] a[href*='/collections/']"
    const result = $(selectors).toArray().map((el, i) => ({ key: `link-${i}`, title: titleOf($(el)), url: absolute($(el).attr("href")), children: [] }))
      .filter(node => node.title)
    best = general ? clean(result) : result
    structured = false
  }
  // A single candidate avoids desktop/mobile double counting. Duplicates within
  // that candidate are merged while preserving the first occurrence and order.
  let count = 0, truncated = false
  function finalize(items: MenuNode[], parent = "", depth = 0): MenuNode[] {
    const deduped = new Map<string, MenuNode>()
    for (const item of items) {
      const identity = general ? `${item.url ?? ""}\n${item.title.toLocaleLowerCase()}` : `${deduped.size}`
      const existing = deduped.get(identity)
      if (existing) existing.children.push(...item.children)
      else deduped.set(identity, { ...item, children: [...item.children] })
    }
    const result: MenuNode[] = []
    for (const item of deduped.values()) {
      if (general && (count >= 250 || depth > 10)) { truncated = true; break }
      count++
      const key = `${parent}${result.length}`
      result.push({ ...item, key, children: finalize(item.children, `${key}.`, depth + 1) })
    }
    return result
  }
  best = finalize(best)
  return { menu: best, status: !best.length ? "unavailable" : structured && !truncated ? "structured" : "partial" }
}
