import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
import {
  collectionKey,
  productLink,
  type CatalogProduct,
  type CollectionPlan,
  type MenuNode,
  type ProductLink,
} from "./source"
import { extractNavigation, type NavigationStatus } from "./navigation"
import { inSourceScope, type SourceScope } from "./scope"

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
  options: { navigationOnly?: boolean } = {},
): { menu: MenuNode[]; collections: CollectionPlan[]; navigationStatus: NavigationStatus } {
  if (!options.navigationOnly && !/shopify/i.test(html))
    throw new Error(
      "Cette page n’a pas été identifiée comme une boutique Shopify.",
    )
  const { menu: best, status: navigationStatus } = extractNavigation(html, origin, options.navigationOnly)
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
  if (!plans.size && !options.navigationOnly)
    throw new Error(
      "Aucune collection détectée dans le menu. Une lecture navigateur ou une adaptation du thème est nécessaire.",
    )
  return { menu: best, collections: [...plans.values()], navigationStatus }
}

export function extractCollection(
  html: string,
  pageUrl: string,
  origin: string,
  scope?: SourceScope,
) {
  const $ = load(html)
  const main = $(
    "#product-grid, [id*='product-grid'], .collection__products, .product-grid, [data-product-grid], .collection-products, .main-collection__products-grid",
  ).first()
  const root = main.length ? main : $("main").first()
  if (!root.length)
    throw new Error(`Grille de collection non reconnue. Page : ${pageUrl}`)
  const products = new Map<string, ProductLink>()
  root.find("a[href*='/products/']").each((_, el) => {
    if (
      $(el).closest(
        "product-recommendations, [id*='recommend'], header, footer",
      ).length
    )
      return
    const p = productLink($(el).attr("href")!, origin)
    if (p && inSourceScope(p.url, origin, scope)) products.set(p.handle, p)
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
  if (nextUrl && !inSourceScope(nextUrl, origin, scope))
    throw new Error(`Pagination hors du marché sélectionné : ${nextUrl}`)
  const empty =
    /no products|keine produkte|aucun produit|no results|keine ergebnisse|\bcollection is empty\b/i.test(
      root.text().replace(/\s+/g, " "),
    )
  if (!products.size && !empty)
    throw new Error(
      `La grille est vide sans indication de collection vide : extraction à vérifier. Page : ${pageUrl}`,
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
      seoTitle: $("head > title").first().text().trim(),
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
  const heading = $("h1").first().text().trim()
  const normalizeTitle = (value: string) =>
    value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()
  const metadataTitle = $('meta[property="og:title"]').attr("content") ?? ""
  const metadataUrl =
    $('meta[property="og:url"]').attr("content") ??
    $('link[rel="canonical"]').attr("href")
  let matchingProductMetadata = false
  // Some Shopify themes omit h1. Accept product metadata only when both its
  // title and URL identify the requested JSON product, never a generic page.
  if (
    p && metadataUrl &&
    $('meta[property="og:type"]').attr("content")?.toLowerCase() === "product" &&
    normalizeTitle(metadataTitle) === normalizeTitle(p.title)
  ) {
    try {
      const actual = new URL(metadataUrl, link.url)
      const expected = new URL(link.url)
      matchingProductMetadata = actual.origin === expected.origin &&
        actual.pathname.replace(/\/+$/, "") === expected.pathname.replace(/\/+$/, "")
    } catch { /* Invalid metadata cannot identify a product page. */ }
  }
  const htmlComplete = Boolean(html && (heading || matchingProductMetadata))
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
  if (html && !htmlComplete)
    errors.push("Page HTML produit non reconnue : thème à vérifier.")
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
    title: p?.title ?? (heading || link.handle),
    description: cleanHtml(p?.body_html ?? ""),
    vendor: p?.vendor ?? "",
    productType: p?.product_type ?? "",
    contentLanguage: $("html").attr("lang") ?? "",
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
      title: $("head > title").first().text().trim(),
      description: $("meta[name=description]").attr("content") ?? "",
      canonical: $("link[rel=canonical]").attr("href") ?? link.url,
    },
    collections: link.collections,
    jsonStatus: p ? "complete" : "failed",
    htmlStatus: htmlComplete ? "complete" : "failed",
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
