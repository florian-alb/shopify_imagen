import { describe, expect, test } from "vitest"
import { discoverSourceScopes } from "./markets"
import { inSourceScope, normalizeSourceScope } from "./scope"
import { productLink } from "./source"
import { collectionMenu, effectiveMenu, emptyStructure } from "./model"
import { selectedScopes } from "../../app/features/catalog-import/lib/source-scope"

const origin = "https://source.example"
const paths = ["", "/en-gb", "/de-de", "/it-it", "/nl-nl", "/es-es", "/pl-pl"]
const xml = `<sitemapindex>${paths.flatMap((path) => ["products", "collections"].map((kind) =>
  `<sitemap><loc>${origin}${path}/sitemap_${kind}_1.xml?from=1&amp;to=2</loc></sitemap>`)).join("")}
  <sitemap><loc>https://evil.example/fr-fr/sitemap_products_1.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap_agentic_discovery.xml</loc></sitemap></sitemapindex>`

test("discovers the seven sitemap segments without mixing file kinds or inventing the principal country", () => {
  const scopes = discoverSourceScopes(xml, origin, '<html lang="fr-FR">')
  expect(scopes).toHaveLength(7)
  expect(scopes[0]).toEqual({ path: "", language: "fr" })
  expect(scopes).toContainEqual({ path: "/en-gb", language: "en", market: "GB" })
  expect(selectedScopes(scopes, "all", "all")).toHaveLength(7)
  expect(selectedScopes(scopes, "DE", "all")).toEqual([{ path: "/de-de", language: "de", market: "DE" }])
  expect(selectedScopes(scopes, "all", "fr")).toEqual([scopes[0]])
})
test("one market can offer multiple languages, and one language can span markets", () => {
  const scopes = discoverSourceScopes(`<sitemapindex>${["en-ca", "fr-ca", "fr-fr"].map((s) =>
    `<sitemap><loc>${origin}/${s}/sitemap_products_1.xml</loc></sitemap>`).join("")}</sitemapindex>`, origin, "")
  expect(selectedScopes(scopes, "CA", "all")).toHaveLength(2)
  expect(selectedScopes(scopes, "CA", "fr")).toHaveLength(1)
  expect(selectedScopes(scopes, "all", "fr")).toHaveLength(2)
})
describe("scope boundaries", () => {
  test("preserves localized product URLs and collection context URLs", () => {
    for (const path of paths) expect(productLink(`${origin}${path}/collections/night/products/lamp`, origin)?.url)
      .toBe(`${origin}${path}/products/lamp`)
    expect(inSourceScope(`${origin}/de-de/products/lamp`, origin, { path: "" })).toBe(false)
    expect(inSourceScope(`${origin}/de-de/products/lamp`, origin, { path: "/de-de" })).toBe(true)
    expect(inSourceScope(`${origin}/products/lamp`, origin, { path: "/de-de" })).toBe(false)
  })
  test("rejects unsafe or arbitrary paths and normalizes supplied metadata", () => {
    for (const path of ["/../admin", "//evil.example", "/de-de/products", "/fr?x=1"])
      expect(() => normalizeSourceScope({ path })).toThrow()
    expect(normalizeSourceScope({ path: "/DE-de", language: "fr", market: "FR" }))
      .toEqual({ path: "/de-de", language: "de", market: "DE" })
    expect(inSourceScope("https://evil.example/de-de/products/lamp", origin, { path: "/de-de" })).toBe(false)
  })
  test("keeps only the selected menu and resolves ignored localized collection keys", () => {
    const nodes = paths.map((path) => ({ key: path, title: path || "Principal", url: `${origin}${path}/collections/lamps`, children: [] }))
    const menu = collectionMenu(nodes, origin, { path: "/de-de" })
    expect(menu).toEqual([nodes[2]])
    const structure = emptyStructure()
    structure.menu = menu
    structure.collections = [{ key: "lamps", ignored: true } as typeof structure.collections[number]]
    expect(effectiveMenu(structure, origin)).toEqual([])
  })
})
