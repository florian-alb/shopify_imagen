import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { extractProduct } from "./extract"

const link = {
  handle: "mocassin-daim-homme-marron",
  url: "https://le-mocassin-chic.com/products/mocassin-daim-homme-marron",
  collections: [],
}
const raw = {
  product: {
    id: 10395579973978,
    handle: link.handle,
    title: "Mocassin Daim Homme Marron",
    variants: [{ id: 52158674665818, title: "Marron / 38", price: "89.95" }],
  },
}
const html = readFileSync(
  new URL("./fixtures/mocassin-product-no-h1.html", import.meta.url),
  "utf8",
)

test("product metadata identifies the source product on a theme without h1", () => {
  const product = extractProduct(link, raw, html)
  expect(product.htmlStatus).toBe("complete")
  expect(product.jsonStatus).toBe("complete")
  expect(product.errors).toEqual([])
  expect(product.title).toBe(raw.product.title)
  expect(product.contentLanguage).toBe("fr")
  expect(product.variants[0].currency).toBe("EUR")
  expect(product.warnings).toContain(
    "Aucune rubrique complémentaire reconnue ; vérifier la fiche source.",
  )
})

test.each([
  ["empty response", ""],
  ["error page", "<html><head><title>Not found</title></head><body>404</body></html>"],
  ["home page", html.replace('content="product"', 'content="website"')],
  ["different title", html.replace('content="Mocassin Daim Homme Marron"', 'content="Another product"')],
  ["different product URL", html.replace(/\/products\/mocassin-daim-homme-marron/g, "/products/other")],
  ["different origin", html.replace(/https:\/\/le-mocassin-chic\.com/g, "https://other.example")],
  ["invalid product URL", html.replace('content="https://le-mocassin-chic.com/products/mocassin-daim-homme-marron"', 'content="https://[invalid"')],
  ["title alone", "<head><title>Mocassin Daim Homme Marron</title></head><body>Unavailable</body>"],
  ["empty heading", "<main><h1> </h1></main>"],
])("HTML validation still rejects %s", (_name, page) => {
  const product = extractProduct(link, raw, page)
  expect(product.htmlStatus).toBe("failed")
  expect(product.errors.length).toBeGreaterThan(0)
})

test("metadata fallback requires the source JSON product and accepts canonical URLs", () => {
  expect(extractProduct(link, null, html).htmlStatus).toBe("failed")
  const canonicalOnly = html.replace(/<meta property="og:url"[^>]*>/, "")
  expect(extractProduct(link, raw, canonicalOnly).htmlStatus).toBe("complete")
  expect(extractProduct(link, raw, html.replace('content="Mocassin Daim Homme Marron"', 'content="  MOCASSIN   DAIM HOMME MARRON "')).htmlStatus).toBe("complete")
})
