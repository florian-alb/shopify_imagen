import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
import {
  collectionKey,
  productLink,
  safeKey,
  type CatalogProduct,
  type CollectionPlan,
  type MenuNode,
  type ProductLink,
} from "./model"

export function cleanHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
  })
}
const text = (html: string) => load(html).text().replace(/\s+/g, " ").trim()
const absolute = (value: string | undefined, origin: string) => {
  try {
    const u = new URL(value ?? "", origin)
    return /^https?:$/.test(u.protocol) ? u.href : ""
  } catch {
    return ""
  }
}

export function extractMenu(
  html: string,
  origin: string,
): { menu: MenuNode[]; collections: CollectionPlan[] } {
  const $ = load(html)
  if (!/shopify/i.test(html))
    throw new Error(
      "Cette page n’a pas été identifiée comme une boutique Shopify.",
    )
  const candidates = $(
    "header nav, header [role=navigation], .header__inline-menu, header-menu, .mega-menu, #shopify-section-header nav, nav[aria-label], .menu-drawer__navigation",
  )
  let best: MenuNode[] = []
  function nodes(root: ReturnType<typeof $>, depth: number): MenuNode[] {
    if (depth > 12) return []
    const list = root.is("ul,ol") ? root : root.find("ul,ol").first()
    if (!list.length) return []
    return list
      .children("li")
      .toArray()
      .map((li, index) => {
        const item = $(li)
        const a = item.find("a, summary, button").first()
        const label = a.clone()
        label.find("svg,ul,ol,.icon").remove()
        const title = label
          .text()
          .replace(/keyboard_arrow_down|expand_more/g, "")
          .trim()
        const href = a.attr("href")
        return {
          key: `${depth}-${index}-${safeKey(title)}`,
          title,
          url: href && !href.startsWith("#") ? absolute(href, origin) : null,
          children: nodes(item, depth + 1),
        }
      })
      .filter((n) => n.title)
  }
  // Choose one navigation tree; mobile duplicates must not double collection discovery.
  const score = (items: MenuNode[]): number =>
    items.reduce(
      (n, item) =>
        n +
        (item.url && collectionKey(item.url, origin) ? 1 : 0) +
        score(item.children),
      0,
    )
  for (const candidate of candidates.toArray()) {
    const result = nodes($(candidate), 0)
    if (score(result) > score(best)) best = result
  }
  // Kuscheltierland uses custom elements and divs rather than nested UL lists.
  const desktop = $("header .header__menu-desktop-list").first()
  if (desktop.length) {
    function customNodes(root: ReturnType<typeof $>): MenuNode[] {
      return root
        .children("a, dropdown-component, .header__submenu-item")
        .toArray()
        .map((el, i) => {
          const item = $(el)
          const label = (
            item.is("a") ? item : item.find("button, summary, a").first()
          ).clone()
          label.find("svg,.icon,.material-symbols-outlined").remove()
          const title = label.text().replace(/\s+/g, " ").trim()
          const childRoot = item
            .find(".header__subsubmenu, .dropdown-content")
            .first()
          return {
            key: String(i),
            title,
            url: label.attr("href")
              ? absolute(label.attr("href"), origin)
              : null,
            children: childRoot.length ? customNodes(childRoot) : [],
          }
        })
        .filter((n) => n.title)
    }
    const result = customNodes(desktop)
    if (score(result) >= score(best)) best = result
  }
  if (!best.length) {
    const links = $(
      "header a[href*='/collections/'], [role=navigation] a[href*='/collections/']",
    )
    best = links
      .toArray()
      .map((a, i) => ({
        key: `link-${i}`,
        title: $(a).text().trim(),
        url: absolute($(a).attr("href"), origin),
        children: [],
      }))
      .filter((n) => n.title)
  }
  const plans = new Map<string, CollectionPlan>()
  function walk(items: MenuNode[], parent = "") {
    items.forEach((n, i) => {
      n.key = `${parent}${i}`
      const key = n.url ? collectionKey(n.url, origin) : null
      if (key && !plans.has(key))
        plans.set(key, {
          key,
          url: n.url!,
          title: n.title,
          targetTitle: n.title,
          keyword: n.title,
          description: "",
          seoTitle: "",
          seoDescription: "",
          image: null,
          selected: true,
          tags: [],
          match: "all",
          approved: false,
          provenance: "source",
        })
      walk(n.children, `${n.key}.`)
    })
  }
  walk(best)
  if (!plans.size)
    throw new Error(
      "Aucune collection détectée dans le menu. Une lecture navigateur ou une adaptation du thème est nécessaire.",
    )
  return { menu: best, collections: [...plans.values()] }
}

export function extractCollection(
  html: string,
  pageUrl: string,
  origin: string,
) {
  const $ = load(html)
  const main = $(
    "#product-grid, [id*='product-grid'], .collection__products, .product-grid, [data-product-grid], .collection-products, .main-collection__products-grid",
  ).first()
  const root = main.length ? main : $("main").first()
  if (!root.length) throw new Error("Grille de collection non reconnue.")
  const products = new Map<string, ProductLink>()
  root.find("a[href*='/products/']").each((_, el) => {
    if (
      $(el).closest(
        "product-recommendations, [id*='recommend'], header, footer",
      ).length
    )
      return
    const p = productLink($(el).attr("href")!, origin)
    if (p) products.set(p.handle, p)
  })
  const next = $(
    "a[rel=next], a.pagination__item--next, .pagination a[aria-label*='Next'], .pagination a[aria-label*='Weiter']",
  )
    .first()
    .attr("href")
  const page = new URL(pageUrl).searchParams.get("page") ?? "1"
  let nextUrl = next ? absolute(next, pageUrl) : null
  // Some themes call the previous-page arrow --next. Trust its page number.
  if (nextUrl) {
    const candidatePage = new URL(nextUrl).searchParams.get("page")
    if (candidatePage !== null && Number(candidatePage) !== Number(page) + 1)
      nextUrl = null
  }
  if (!nextUrl) {
    $("nav.pagination a[href], .pagination a[href]").each((_, el) => {
      const url = new URL($(el).attr("href")!, pageUrl)
      if (Number(url.searchParams.get("page")) === Number(page) + 1)
        nextUrl = url.href
    })
  }
  const empty =
    /no products|keine produkte|aucun produit|no results|keine ergebnisse/i.test(
      root.text(),
    )
  if (!products.size && !empty)
    throw new Error(
      "La grille est vide sans indication de collection vide : extraction à vérifier.",
    )
  return {
    products: [...products.values()],
    nextUrl,
    details: {
      description: cleanHtml(
        $(
          ".collection-hero__description, .collection-description, [class*='collection__description']",
        )
          .first()
          .html() ?? "",
      ),
      seoTitle: $("title").text(),
      seoDescription: $("meta[name=description]").attr("content") ?? "",
      image: $(".collection-hero img").first().attr("src")
        ? absolute($(".collection-hero img").first().attr("src"), origin)
        : null,
    },
  }
}

export function extractSitemap(xml: string, origin: string) {
  const $ = load(xml, { xml: true })
  return {
    maps: $("sitemap > loc")
      .toArray()
      .map((el) => absolute($(el).text(), origin)),
    products: $("url > loc")
      .toArray()
      .flatMap((el) => {
        const p = productLink($(el).text(), origin)
        return p ? [p] : []
      }),
  }
}

type ShopifyJson = {
  product: {
    id: number | string
    title: string
    handle: string
    body_html?: string
    vendor?: string
    product_type?: string
    tags?: string | string[]
    options?: Array<{ name: string; values: string[] }>
    variants?: Array<{
      id: string | number
      title: string
      sku?: string
      price: string
      price_currency?: string
      compare_at_price?: string
      option1?: string
      option2?: string
      option3?: string
      weight?: number
      weight_unit?: string
      image_id?: number | null
    }>
    images?: Array<{
      id: number | string
      src: string
      alt?: string
      position?: number
    }>
  }
}

export function extractProduct(
  link: ProductLink,
  raw: unknown,
  html: string | null,
  errors: string[] = [],
): CatalogProduct {
  const p = (raw as ShopifyJson | null)?.product
  if (
    p &&
    (!p.id ||
      !p.title ||
      !Array.isArray(p.variants) ||
      !p.variants.length ||
      (p.images && !Array.isArray(p.images)) ||
      (p.options && !Array.isArray(p.options)))
  )
    throw new Error("Réponse JSON produit invalide.")
  errors = [...errors]
  if (!p) errors.push("Données JSON indisponibles.")
  if (!html) errors.push("Page HTML indisponible.")
  const $ = load(html ?? "")
  const sections: CatalogProduct["sections"] = []
  const seen = new Set<string>()
  const containers = $(
    "main details, main .accordion, main [class*='accordion__item'], [id*='__main'] details, [id*='__main'] .accordion",
  )
  containers.each((_, el) => {
    if ($(el).closest("[id*='recommend'], header, footer").length) return
    const label = $(el)
      .find("summary, .accordion__title, button, h3")
      .first()
      .clone()
    label.find("svg,.icon,.material-symbols-outlined").remove()
    const title = label.text().replace(/\s+/g, " ").trim()
    if (
      !title ||
      /liefer|versand|shipping|delivery|return|rückgabe|avis|review|description|beschreibung/i.test(
        title,
      )
    )
      return
    const content = $(el)
      .find(
        ".accordion__content, .accordion-content, [class*='accordion__body'], [role=region]",
      )
      .first()
    const clone = $(el).clone()
    clone.find("summary,button,svg,h3").remove()
    const body = cleanHtml(
      content.length ? (content.html() ?? "") : (clone.html() ?? ""),
    )
    const key = text(body)
    if (key && !seen.has(key)) {
      sections.push({ title, html: body })
      seen.add(key)
    }
  })
  const warnings: string[] = []
  if (html && !$("h1").length)
    errors.push("Page HTML sans titre produit : thème à vérifier.")
  if (html && !sections.length)
    warnings.push(
      "Aucune rubrique complémentaire reconnue ; vérifier la fiche source.",
    )
  const tags = Array.isArray(p?.tags)
    ? p.tags
    : (p?.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
  return {
    key: p ? String(p.id) : link.handle,
    sourceId: p ? String(p.id) : null,
    handle: p?.handle ?? link.handle,
    url: link.url,
    title: p?.title ?? $("h1").first().text().trim() ?? link.handle,
    description: cleanHtml(p?.body_html ?? ""),
    vendor: p?.vendor ?? "",
    productType: p?.product_type ?? "",
    sourceTags: tags,
    options: p?.options ?? [],
    variants: (p?.variants ?? []).map((v) => ({
      id: String(v.id),
      title: v.title,
      sku: v.sku ?? "",
      price: v.price,
      currency:
        v.price_currency ??
        $(
          'meta[property="product:price:currency"], meta[property="og:price:currency"]',
        )
          .first()
          .attr("content") ??
        html?.match(
          /Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/,
        )?.[1] ??
        "",
      compareAtPrice: v.compare_at_price || null,
      options: [v.option1, v.option2, v.option3].filter((x): x is string =>
        Boolean(x),
      ),
      weight: v.weight ?? 0,
      weightUnit: v.weight_unit ?? "kg",
      imageId: v.image_id ? String(v.image_id) : null,
    })),
    images: (p?.images ?? []).map((img, i) => ({
      id: String(img.id),
      url: img.src,
      alt: img.alt ?? "",
      position: img.position ?? i + 1,
    })),
    sections,
    seo: {
      title: $("title").text(),
      description: $("meta[name=description]").attr("content") ?? "",
      canonical: $("link[rel=canonical]").attr("href") ?? link.url,
    },
    collections: link.collections,
    jsonStatus: p ? "complete" : "failed",
    htmlStatus: html && $("h1").length ? "complete" : "failed",
    errors,
    warnings,
    fetchedAt: Date.now(),
  }
}

export function importDescription(product: CatalogProduct) {
  return cleanHtml(
    product.description +
      product.sections
        .map(
          (section) =>
            `<h2>${sanitizeHtml(section.title, { allowedTags: [], allowedAttributes: {} })}</h2>${section.html}`,
        )
        .join(""),
  )
}
