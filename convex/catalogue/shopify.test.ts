/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { beforeEach, afterEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { internal } from "../_generated/api"
import { extractProduct } from "./extract"
import { encode, decode, type Work, type RemoteResult } from "./model"
import { productInput } from "./shopifyModel"
import { REQUIRED_SHOPIFY_ADMIN_SCOPES } from "../shopify/scopes"

const remote = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
  exists: false,
  existing: false,
  uncertain: false,
  unreconciled: false,
  bulkQuery: "",
  uploads: [] as string[],
  tags: ["merchant-manual"],
  failedMedia: false,
}))
vi.mock("../shopify/client", () => ({
  shopifyGraphql: async (query: string, variables: Record<string, unknown>) => {
    remote.calls.push({ query, variables })
    if (query.includes("CatalogImportDiagnostic"))
      return {
        currentAppInstallation: {
          accessScopes: REQUIRED_SHOPIFY_ADMIN_SCOPES.map((handle) => ({
            handle,
          })),
        },
        shop: {
          currencyCode: "EUR",
          primaryDomain: { url: "https://destination.example" },
        },
      }
    if (query.includes("CatalogImportDefinitions"))
      return {
        metafieldDefinitions: {
          nodes: [
            {
              type: { name: "id" },
              capabilities: { uniqueValues: { enabled: true } },
            },
          ],
        },
      }
    if (query.includes("CatalogImportCollections"))
      return { collections: { nodes: [] } }
    if (query.includes("CatalogImportCollection("))
      return {
        collectionCreate: {
          collection: {
            id: "gid://shopify/Collection/10",
            handle: "cat-target",
          },
          userErrors: [],
        },
      }
    if (query.includes("CatalogImportFindProduct"))
      return {
        productByIdentifier: remote.exists
          ? {
              id: "gid://shopify/Product/1",
              handle: "target-product",
              tags: remote.tags,
            }
          : null,
      }
    if (query.includes("CatalogImportTags")) {
      remote.tags = [
        ...new Set([...remote.tags, ...(variables.tags as string[])]),
      ]
      return { tagsAdd: { userErrors: [] } }
    }
    if (query.includes("CatalogImportUpload"))
      return {
        stagedUploadsCreate: {
          stagedTargets: [
            {
              url: "https://upload.example",
              parameters: [{ name: "key", value: "temporary.jsonl" }],
            },
          ],
          userErrors: [],
        },
      }
    if (query.includes("CatalogImportBulk(")) {
      remote.bulkQuery = variables.mutation as string
      remote.exists = true
      remote.tags.push("cat")
      if (remote.uncertain) throw new Error("Network response lost")
      return {
        bulkOperationRunMutation: {
          bulkOperation: { id: "gid://shopify/BulkOperation/1" },
          userErrors: [],
        },
      }
    }
    if (query.includes("CatalogImportBulkRecent"))
      return {
        bulkOperations: {
          nodes: remote.unreconciled
            ? []
            : [
                {
                  id: "gid://shopify/BulkOperation/1",
                  query: remote.bulkQuery,
                },
              ],
        },
      }
    if (query.includes("CatalogImportBulkStatus"))
      return { node: { status: "COMPLETED" } }
    if (query.includes("CatalogImportVerify"))
      return {
        product: {
          status: remote.existing ? "ACTIVE" : "DRAFT",
          tags: remote.tags,
          variantsCount: { count: 1 },
          metafield: { value: "source.example:123" },
          media: {
            nodes: [{ status: remote.failedMedia ? "FAILED" : "READY" }],
            pageInfo: { hasNextPage: false },
          },
          collections: {
            nodes: [{ id: "gid://shopify/Collection/10" }],
            pageInfo: { hasNextPage: false },
          },
        },
      }
    if (query.includes("CatalogImportDescription"))
      return { productUpdate: { userErrors: [] } }
    if (query.includes("CatalogImportMenus")) return { menus: { nodes: [] } }
    if (query.includes("CatalogImportMenu("))
      return {
        menuCreate: {
          menu: { id: "gid://shopify/Menu/1", handle: "imported-menu" },
          userErrors: [],
        },
      }
    throw new Error(`Unexpected operation ${query}`)
  },
}))
const modules = import.meta.glob("../**/*.ts")
const raw = {
  product: {
    id: 123,
    handle: "cat",
    title: "Original",
    body_html: '<p><a href="/collections/cats">Cats</a></p>',
    options: [{ name: "Title", values: ["Default Title"] }],
    variants: [
      {
        id: 456,
        title: "Default Title",
        price: "12.50",
        price_currency: "EUR",
        option1: "Default Title",
      },
    ],
    images: [],
  },
}
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(remote, {
    calls: [],
    exists: false,
    existing: false,
    uncertain: false,
    unreconciled: false,
    bulkQuery: "",
    uploads: [],
    tags: ["merchant-manual"],
    failedMedia: false,
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const file = (options.body as FormData).get("file") as Blob
      remote.uploads.push(await file.text())
      return new Response("", { status: 200 })
    }),
  )
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function fixture() {
  const t = convexTest(schema, modules)
  const seeded = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { approvalStatus: "approved" }),
      shopId = await ctx.db.insert("shops", {
        domain: "destination.myshopify.com",
        createdByUserId: owner,
        accessToken: "test-token",
        clientId: "test-client",
        clientSecret: "test-secret",
        createdAt: 1,
        updatedAt: 1,
      })
    const structure = {
      menu: [
        {
          key: "group",
          title: "Group",
          url: null,
          children: [
            {
              key: "cats",
              title: "Cats",
              url: "https://source.example/collections/cats",
              children: [],
            },
          ],
        },
      ],
      collections: [
        {
          key: "cats",
          url: "https://source.example/collections/cats",
          title: "Cats",
          description: "",
          image: null,
          tag: "cat",
          validated: true,
          outsideMenu: false,
          membership: "complete",
          count: 1,
          selectedCount: 1,
        },
      ],
      warnings: [],
    }
    const id = await ctx.db.insert("catalogues", {
      ownerId: owner,
      origin: "https://source.example",
      mode: "ALL",
      status: "working",
      phase: "setup",
      structure: encode(structure),
      work: encode({
        kind: "import",
        phase: "setup",
        shopId,
        importVersion: 1,
        mappings: {},
      }),
      generation: 1,
      version: 1,
      total: 1,
      complete: 1,
      failed: 0,
      sourceCount: 1,
      initialCount: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const data = extractProduct(
      {
        handle: "cat",
        url: "https://source.example/products/cat",
        collections: ["cats"],
      },
      raw,
      "<main><h1>Original</h1><details><summary>Pflege</summary><p>Hand wash</p></details></main>",
    )
    const productId = await ctx.db.insert("produits", {
      catalogueId: id,
      identity: "source.example:123",
      handle: "cat",
      url: data.url,
      selected: true,
      collections: ["cats"],
      group: "cats",
      rank: 1,
      title: data.title,
      titleLower: data.title.toLowerCase(),
      state: "complete",
      attempts: 1,
      jsonSource: encode(raw),
      data: encode(data),
      inSitemap: true,
    })
    return { id, productId, shopId }
  })
  const run = async () => {
    for (let n = 0; n < 50; n++) {
      const c = (await t.query(internal.catalogues.context, { id: seeded.id }))!
      if (c.status !== "working") return c
      const w = decode<Work>(c.work!)
      if (w.retryAt) vi.setSystemTime(w.retryAt + 1)
      await t.action(internal.catalogueActions.work, {
        id: c._id,
        generation: 1,
      })
    }
    throw new Error("did not finish")
  }
  return { t, ...seeded, run }
}
test("creates drafts through a bounded bulk, retains source ID tuple and verifies result before menu", async () => {
  const f = await fixture(),
    c = await f.run()
  expect(c.work).toBeUndefined()
  expect(c.lastImport).toBeTruthy()
  const line = JSON.parse(remote.uploads[0])
  expect(line.input.status).toBe("DRAFT")
  expect(line.input.metafields[0]).toEqual(line.identifier.customId)
  expect(line.input.metafields[0]).not.toHaveProperty("type")
  const p = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(p!.remote!).status).toBe("complete")
  const menu = remote.calls.find((x) => x.query.includes("CatalogImportMenu("))!
  expect((menu.variables.items as Array<{ url: string }>)[0].url).toBe("#")
  expect(remote.calls.some((x) => /publish|themeUpdate/.test(x.query))).toBe(
    false,
  )
})
test("existing products keep merchant tags and active status without productSet", async () => {
  remote.exists = true
  remote.existing = true
  const f = await fixture()
  await f.run()
  expect(remote.tags).toContain("merchant-manual")
  expect(remote.tags).toContain("cat")
  expect(remote.uploads).toHaveLength(0)
  const p = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(p!.remote!).created).toBe(false)
  expect(
    remote.calls.some((x) => x.query.includes("CatalogImportDescription")),
  ).toBe(false)
})
test("a lost bulk response is reconciled by its persisted token, never blindly resubmitted", async () => {
  remote.uncertain = true
  const f = await fixture()
  const c = await f.run()
  expect(c.work).toBeUndefined()
  expect(
    remote.calls.filter((x) => x.query.includes("CatalogImportBulk(")),
  ).toHaveLength(1)
  expect(
    remote.calls.some((x) => x.query.includes("CatalogImportBulkRecent")),
  ).toBe(true)
})
test("unreconciled submissions retain the lock and never allow duplicate creation", async () => {
  remote.uncertain = true
  remote.unreconciled = true
  const f = await fixture()
  const c = await f.run()
  expect(c.status).toBe("blocked")
  expect(decode<Work>(c.work!).bulk?.token).toBeTruthy()
  expect(
    remote.calls.filter((x) => x.query.includes("CatalogImportBulk(")),
  ).toHaveLength(1)
})
test("media failures stay failures even if Shopify created the product", async () => {
  remote.failedMedia = true
  const f = await fixture()
  await f.run()
  const p = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(p!.remote!).status).toBe("failed")
})
test("incomplete HTML cannot enter a Shopify payload", () => {
  const p = extractProduct(
    {
      handle: "cat",
      url: "https://source.example/products/cat",
      collections: [],
    },
    raw,
    null,
  )
  expect(() =>
    productInput(
      { ...p, tags: [], excluded: false, reviewed: false },
      "https://source.example",
      "",
    ),
  ).toThrow("incomplète")
})
