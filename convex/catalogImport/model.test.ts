// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import {
  extractCollection,
  extractMenu,
  extractProduct,
  cleanHtml,
} from "./extract"
import {
  bucketFor,
  BUCKET_COUNT,
  mergeLinks,
  productLink,
  prepareProduct,
  matchesCollection,
  validateStructureBudget,
  type CollectionPlan,
  type ProductLink,
} from "./model"
import { publicIp } from "./network"
import { productInput, targetMenu } from "./shopify"

test("structure budgets count UTF-8 bytes and all menu branches before returning to Convex", () => {
  expect(() =>
    validateStructureBudget({ collections: [], menu: [] }),
  ).not.toThrow()
  expect(() =>
    validateStructureBudget({
      collections: Array.from({ length: 501 }, () => plan("rabbit", [])),
      menu: [],
    }),
  ).toThrow("500 collections")
  expect(() =>
    validateStructureBudget({
      collections: [],
      menu: [{ key: "a", title: "🐰".repeat(80_000), url: null, children: [] }],
    }),
  ).toThrow("300 Ko")
  expect(() =>
    validateStructureBudget({
      collections: [],
      menu: Array.from({ length: 501 }, (_, i) => ({
        key: String(i),
        title: "a",
        url: null,
        children: [{ key: `child-${i}`, title: "b", url: null, children: [] }],
      })),
    }),
  ).toThrow("1 000 éléments")
})

const origin = "https://www.kuscheltierland.de"
test("Kuscheltierland collection HTML discovers all pages without following the mislabeled previous arrow", () => {
  const url = `${origin}/collections/capybara-kuscheltier`
  const pages = [1, 2].map((page) =>
    extractCollection(
      readFileSync(
        new URL(
          `./fixtures/kuscheltierland-collection-${page}.html`,
          import.meta.url,
        ),
        "utf8",
      ),
      page === 1 ? url : `${url}?page=2`,
      origin,
    ),
  )
  expect(pages[0].products).toHaveLength(24)
  expect(pages[0].nextUrl).toBe(`${url}?page=2`)
  expect(pages[1].products).toHaveLength(16)
  expect(pages[1].nextUrl).toBeNull()
  expect(
    new Set(
      pages.flatMap((page) => page.products.map((product) => product.handle)),
    ).size,
  ).toBe(40)
})
const html = readFileSync(
  new URL("./fixtures/kuscheltierland.html", import.meta.url),
  "utf8",
)
const json = JSON.parse(
  readFileSync(
    new URL("./fixtures/kuscheltierland.json", import.meta.url),
    "utf8",
  ),
)
const link = {
  handle: json.product.handle,
  url: `${origin}/products/${json.product.handle}`,
  collections: ["rabbit", "large"],
}
export const plan = (key: string, tags: string[]): CollectionPlan => ({
  key,
  url: `${origin}/collections/${key}`,
  title: key,
  targetTitle: key,
  keyword: key,
  description: "",
  seoTitle: "",
  seoDescription: "",
  image: null,
  tags,
  match: "all",
  approved: true,
  selected: true,
  provenance: "manual",
})

describe("catalogue extraction and preparation", () => {
  test("preserves the real pilot's three-level menu without desktop/mobile duplication", () => {
    const result = extractMenu(html, origin)
    expect(
      result.menu
        .find((n) => n.title === "Tier-Kuscheltiere")
        ?.children.find((n) => n.title === "Kuscheltiere Wald")?.children[0]
        .url,
    ).toContain("capybara-kuscheltier")
    expect(
      result.collections.filter((c) => c.key === "capybara-kuscheltier"),
    ).toHaveLength(1)
    expect(result.menu.filter((n) => n.title === "Bestseller")).toHaveLength(1)
  })
  test.each(["header__inline-menu", "header-menu"])(
    "supports nested Dawn/Horizon navigation: %s",
    (selector) => {
      const markup = `<header><${selector === "header-menu" ? selector : `nav class="${selector}"`}><ul><li><details><summary>Animaux</summary><ul><li><a href="/collections/rabbit">Lapin</a></li></ul></details></li><li><a href="/collections/rabbit">Favoris</a></li></ul></${selector === "header-menu" ? selector : "nav"}></header><!-- Shopify -->`
      const result = extractMenu(markup, origin)
      expect(result.menu).toHaveLength(2)
      expect(result.collections).toHaveLength(1)
      expect(result.menu[0].children[0].title).toBe("Lapin")
    },
  )
  test("merges actual JSON variants and product-specific HTML sections", () => {
    const p = extractProduct(link, json, html)
    expect(p.sourceId).toBe("10639408595281")
    expect(p.variants).toHaveLength(3)
    expect(p.variants.every((v) => v.currency === "EUR")).toBe(true)
    expect(p.sections.map((s) => s.title)).toEqual([
      "Pflege",
      "Produktdetails",
      "Hinweise Zur Verwendung",
    ])
    expect(p.sections.map((s) => s.html).join("")).toContain("PP Cotton")
    expect(p.errors).toEqual([])
  })
  test("normalizes collection/variant URLs and merges all memberships", () => {
    const a = productLink(
      "/collections/rabbit/products/plush?variant=12",
      origin,
    )!
    const b = productLink("/products/plush?utm_source=test", origin)!
    const c = productLink("/products/plush", origin)!
    expect(
      mergeLinks(
        [{ ...a, collections: ["rabbit"] }],
        [
          { ...b, collections: ["large"] },
          { ...c, collections: ["gifts"] },
        ],
      ),
    ).toEqual([{ ...c, collections: ["gifts", "large", "rabbit"] }])
    expect(
      productLink("https://foreign.example/products/plush", origin),
    ).toBeNull()
  })
  test("only collects the grid and detects pagination and anomalous emptiness", () => {
    const r = extractCollection(
      '<main><div id="product-grid"><a href="/products/plush">P</a></div><product-recommendations><a href="/products/no">No</a></product-recommendations><nav class="pagination"><a href="?page=2">2</a></nav></main>',
      `${origin}/collections/rabbit`,
      origin,
    )
    expect(r.products.map((p) => p.handle)).toEqual(["plush"])
    expect(r.nextUrl).toBe(`${origin}/collections/rabbit?page=2`)
    expect(() =>
      extractCollection(
        '<main><div id="product-grid"></div></main>',
        origin,
        origin,
      ),
    ).toThrow("vide")
  })
  test("AND rules, manual corrections, and size contradictions survive preparation", () => {
    const plans = [
      plan("rabbit", ["lapin"]),
      { ...plan("large", ["grande"]), minSizeCm: 100 },
      plan("new", ["grande", "lapin"]),
    ]
    const p = prepareProduct(extractProduct(link, json, html), plans)
    expect(matchesCollection(p.tags, plans[2])).toBe(true)
    expect(matchesCollection(["lapin"], plans[2])).toBe(false)
    expect(p.warnings.join(" ")).toContain("100 cm")
    expect(
      prepareProduct(p, plans, { tags: ["manuel"], title: "Corrigé" }),
    ).toMatchObject({ tags: ["manuel"], title: "Corrigé" })
  })
  test("missing sources remain explicit failures and unsafe markup is removed", () => {
    expect(extractProduct(link, json, null).errors).not.toHaveLength(0)
    expect(extractProduct(link, null, html).jsonStatus).toBe("failed")
    expect(
      cleanHtml(
        '<script>alert(1)</script><p onclick="x()">Texte <a href="javascript:alert(1)">lien</a></p>',
      ),
    ).toBe("<p>Texte <a>lien</a></p>")
  })
  test("destination inputs preserve weights and stay in draft; menus enforce Shopify depth", () => {
    const p = prepareProduct(extractProduct(link, json, html), [
      plan("rabbit", ["lapin"]),
    ])
    expect(productInput(p, origin, p.description)).toMatchObject({
      status: "DRAFT",
      variants: [{ inventoryItem: { tracked: false } }, {}, {}],
    })
    const state = {
      collections: {
        rabbit: { id: "gid://shopify/Collection/1", handle: "lapin" },
      },
      domain: "https://destination.example",
      currency: "EUR",
    }
    expect(
      targetMenu(
        [
          {
            key: "1",
            title: "Lapin",
            url: `${origin}/collections/rabbit`,
            children: [],
          },
        ],
        origin,
        state,
        new Set(["rabbit"]),
      ),
    ).toMatchObject([
      { type: "COLLECTION", resourceId: state.collections.rabbit.id },
    ])
    expect(targetMenu([], origin, state, new Set(), 4)).toEqual([])
  })
  test("100,000 products with three memberships remain unique in bounded partitions", () => {
    const buckets: ProductLink[][] = Array.from(
      { length: BUCKET_COUNT },
      () => [],
    )
    for (let i = 0; i < 100_000; i++) {
      const handle = `product-${i}`
      for (const collection of ["rabbit", "large", "gifts"])
        buckets[bucketFor(handle)].push({
          handle,
          url: `${origin}/products/${handle}`,
          collections: [collection],
        })
    }
    let count = 0
    for (const bucket of buckets) {
      const unique = mergeLinks([], bucket)
      expect(unique.length).toBeLessThan(600)
      expect(unique.every((p) => p.collections.length === 3)).toBe(true)
      count += unique.length
    }
    expect(count).toBe(100_000)
  })
  test.each([
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "172.16.2.3",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])("rejects non-public addresses: %s", (ip) =>
    expect(publicIp(ip)).toBe(false),
  )
})
