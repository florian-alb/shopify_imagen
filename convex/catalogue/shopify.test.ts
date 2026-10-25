/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { createHash } from "node:crypto"
import { beforeEach, afterEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { api, internal } from "../_generated/api"
import { extractProduct } from "./extract"
import { encode, decode, type Structure, type Work, type RemoteResult } from "./model"
import { productInput } from "./shopifyModel"
import { REQUIRED_SHOPIFY_ADMIN_SCOPES } from "../shopify/scopes"
import type { ImportSelection } from "./importSelection"
import { parseCollectionTags } from "./tags"

const remote = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
  exists: false,
  existing: false,
  uncertain: false,
  unreconciled: false,
  bulkQuery: "",
  uploads: [] as string[],
  tags: ["merchant-manual"],
  collectionTags: ["cat"],
  failedMedia: false,
  collectionExists: false,
  membershipMissing: false,
  scopes: [] as string[],
}))
vi.mock("../shopify/client", () => ({
  shopifyGraphql: async (query: string, variables: Record<string, unknown>) => {
    remote.calls.push({ query, variables })
    if (query.includes("CatalogImportDiagnostic"))
      return {
        currentAppInstallation: {
          accessScopes: remote.scopes.map((handle) => ({
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
      return { collections: { nodes: remote.collectionExists ? [{
        id: "gid://shopify/Collection/10",
        handle: String(variables.query).slice("handle:".length),
        metafield: { value: `source.example:cats:${createHash("sha256").update(JSON.stringify([remote.collectionTags, "all"])).digest("hex")}` },
      }] : [] } }
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
      remote.tags.push(...remote.collectionTags)
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
            nodes: remote.membershipMissing ? [] : [{ id: "gid://shopify/Collection/10" }],
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
    collectionTags: ["cat"],
    failedMedia: false,
    collectionExists: false,
    membershipMissing: false,
    scopes: [...REQUIRED_SHOPIFY_ADMIN_SCOPES],
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
async function fixture(selection?: ImportSelection, tag = "cat") {
  remote.collectionTags = parseCollectionTags(tag).sort()
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
          tag,
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
        ...(selection ? { selection } : {}),
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
    return { id, productId, shopId, owner }
  })
  const run = async () => {
    for (let n = 0; n < 50; n++) {
      const c = (await t.query(internal.catalogues.context, { id: seeded.id }))!
      if (c.status !== "working") return c
      const w = decode<Work>(c.work!)
      if (w.retryAt) vi.setSystemTime(w.retryAt + 1)
      await t.action(internal.catalogueActions.work, {
        id: c._id,
        generation: c.generation,
      })
    }
    throw new Error("did not finish")
  }
  return { t, ...seeded, run }
}
test.each([
  { products: true, collections: false, menu: false },
  { products: false, collections: true, menu: false },
  { products: false, collections: false, menu: true },
  { products: true, collections: true, menu: false },
  { products: true, collections: false, menu: true },
  { products: false, collections: true, menu: true },
  { products: true, collections: true, menu: true },
])("imports only the selected elements: %j", async (selection) => {
  remote.collectionExists = !selection.collections
  remote.membershipMissing = !selection.collections
  remote.scopes = [
    selection.products || selection.collections ? "write_products" : "read_products",
    ...(selection.products ? ["write_files"] : []),
    ...(selection.menu ? ["write_online_store_navigation"] : []),
  ]
  const f = await fixture(selection)
  const c = await f.run()
  expect(c.work).toBeUndefined()
  expect(c.error).toBeUndefined()
  const result = decode<{ selection: ImportSelection; complete: number; failed: number; collections: number; menuId?: string }>(c.lastImport!)
  expect(result.selection).toEqual(selection)
  expect(result.complete).toBe(selection.products ? 1 : 0)
  expect(result.failed).toBe(0)
  expect(result.collections).toBe(selection.collections ? 1 : 0)
  expect(Boolean(result.menuId)).toBe(selection.menu)
  expect(remote.calls.some((call) => call.query.includes("CatalogImportCollection("))).toBe(selection.collections)
  expect(remote.calls.some((call) => call.query.includes("CatalogImportMenu("))).toBe(selection.menu)
  expect(remote.uploads.length).toBe(selection.products ? 1 : 0)
  const product = await f.t.query(internal.catalogues.byId, { id: f.productId })
  if (!selection.products) {
    expect(product?.remote).toBeUndefined()
    expect(remote.calls.some((call) => /CatalogImport(?:Definitions|Definition\(|FindProduct|Tags|Upload|Bulk|Verify|Description)/.test(call.query))).toBe(false)
  } else expect(decode<RemoteResult>(product!.remote!).status).toBe("complete")
})

test("menu without collections stops before writing if a destination collection is missing, and releases the lock", async () => {
  const f = await fixture({ products: true, collections: false, menu: true })
  const c = await f.run()
  expect(c.status).toBe("partial")
  expect(c.work).toBeUndefined()
  expect(c.error).toContain("Collection absente pour le menu")
  expect(remote.uploads).toHaveLength(0)
  expect(remote.calls.some((call) => /CatalogImport(?:Collection\(|Menu\(|FindProduct|Bulk\()/.test(call.query))).toBe(false)
  await f.t.withIdentity({ subject: f.owner }).mutation(api.catalogues.startImport, {
    id: f.id, shopId: f.shopId, version: c.version, allowPartial: false,
    selection: { products: true, collections: true, menu: true },
  })
  const retried = await f.run()
  expect(retried.work).toBeUndefined()
  expect(retried.error).toBeUndefined()
  expect(decode<{ complete: number }>(retried.lastImport!).complete).toBe(1)
})

test("selection is validated and frozen by the public mutation, then retained on a blocked retry", async () => {
  const f = await fixture()
  await f.t.run((ctx) => ctx.db.patch(f.id, { status: "ready", work: undefined }))
  const user = f.t.withIdentity({ subject: f.owner })
  const args = { id: f.id, shopId: f.shopId, version: 1, allowPartial: false }
  await expect(user.mutation(api.catalogues.startImport, { ...args, selection: { products: false, collections: false, menu: false } })).rejects.toThrow("au moins un")
  const other = f.t.withIdentity({ subject: await f.t.run((ctx) => ctx.db.insert("users", { approvalStatus: "approved" })) })
  await expect(other.mutation(api.catalogues.startImport, { ...args, selection: { products: true, collections: false, menu: false } })).rejects.toThrow("inaccessible")
  const selection = { products: true, collections: false, menu: false }
  await user.mutation(api.catalogues.startImport, { ...args, selection })
  const c = (await f.t.query(internal.catalogues.context, { id: f.id }))!
  expect(decode<Work>(c.work!).selection).toEqual(selection)
  remote.uncertain = remote.unreconciled = true
  const blocked = await f.run()
  expect(blocked.status).toBe("blocked")
  expect(decode<Work>(blocked.work!).selection).toEqual(selection)
  await user.mutation(api.catalogues.retry, { id: f.id })
  const retried = (await f.t.query(internal.catalogues.context, { id: f.id }))!
  expect(decode<Work>(retried.work!).selection).toEqual(selection)
})

test("a subsequent import with collections rechecks products without reusing the previous run's result", async () => {
  const f = await fixture({ products: true, collections: false, menu: false })
  remote.membershipMissing = true
  const first = await f.run()
  expect(decode<{ created: number }>(first.lastImport!).created).toBe(1)
  const checks = remote.calls.filter((call) => call.query.includes("CatalogImportVerify")).length
  remote.membershipMissing = false
  await f.t.withIdentity({ subject: f.owner }).mutation(api.catalogues.startImport, {
    id: f.id, shopId: f.shopId, version: first.version, allowPartial: false,
    selection: { products: true, collections: true, menu: false },
  })
  const second = await f.run()
  expect(second.work).toBeUndefined()
  expect(remote.calls.filter((call) => call.query.includes("CatalogImportVerify"))).toHaveLength(checks + 1)
  expect(remote.uploads).toHaveLength(1)
  expect(decode<{ created: number; existing: number }>(second.lastImport!)).toMatchObject({ created: 0, existing: 1 })
  const product = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(product!.remote!).importGeneration).toBe(second.generation)
})

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
test.each([
  { products: true, collections: true, menu: true },
  { products: false, collections: true, menu: false },
  { products: false, collections: false, menu: true },
])("ignored collections are absent from Shopify while their products are retained: %j", async (selection) => {
  const f = await fixture(selection)
  remote.collectionTags = []
  remote.membershipMissing = true
  await f.t.run(async (ctx) => {
    const c = (await ctx.db.get(f.id))!
    const structure = decode<Structure>(c.structure)
    Object.assign(structure.collections[0], { ignored: true, tag: "", validated: false })
    await ctx.db.patch(f.id, { structure: encode(structure) })
  })
  const c = await f.run()
  expect(c.work).toBeUndefined()
  const summary = decode<{ collections: number; complete: number; menuId?: string }>(c.lastImport!)
  expect(summary.collections).toBe(0)
  expect(summary.menuId).toBeUndefined()
  expect(remote.calls.some((call) => /CatalogImportCollection|CatalogImportMenu/.test(call.query))).toBe(false)
  const product = (await f.t.query(internal.catalogues.byId, { id: f.productId }))!
  expect(product.collections).toEqual(["cats"])
  expect(product.selected).toBe(true)
  if (selection.products) {
    expect(JSON.parse(remote.uploads[0].trim()).input.tags).toEqual([])
    expect(decode<RemoteResult>(product.remote!).status).toBe("complete")
    expect(summary.complete).toBe(1)
  } else expect(remote.uploads).toHaveLength(0)
})
test("multiple collection tags create separate AND rules and reach the product payload", async () => {
  const f = await fixture(undefined, "mocassins, femme")
  await f.run()
  const created = remote.calls.find((call) => call.query.includes("CatalogImportCollection("))!
  expect(created.variables.input).toMatchObject({
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: "TAG", relation: "EQUALS", condition: "femme" },
        { column: "TAG", relation: "EQUALS", condition: "mocassins" },
      ],
    },
  })
  expect(JSON.parse(remote.uploads[0].trim()).input.tags).toEqual(["femme", "mocassins"])
  const p = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(p!.remote!).status).toBe("complete")
})

test("reordering collection tags retains the same Shopify handle and marker", async () => {
  const selection = { products: false, collections: true, menu: false }
  const first = await fixture(selection, "mocassins, femme")
  await first.run()
  const created = remote.calls.find((call) => call.query.includes("CatalogImportCollection("))!.variables.input
  remote.calls = []
  const reordered = await fixture(selection, "femme, mocassins")
  await reordered.run()
  expect(remote.calls.find((call) => call.query.includes("CatalogImportCollection("))!.variables.input).toEqual(created)
})

test.each([false, true])("membership verification requires all collection tags (manual override: %s)", async (manual) => {
  remote.exists = remote.existing = true
  remote.membershipMissing = true
  remote.tags.push("mocassins", ...(manual ? [] : ["femme"]))
  // An old timestamp makes a missing membership fail without waiting for indexing.
  vi.setSystemTime(1_000_000)
  const f = await fixture(undefined, "mocassins, femme")
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.productId, {
      ...(manual ? { override: encode({ tags: ["mocassins"] }) } : {}),
      remote: encode({ shopId: f.shopId, status: "verifying", id: "gid://shopify/Product/1", handle: "target-product", created: false, startedAt: 1, catalogueVersion: 1 }),
    })
  })
  await f.run()
  const p = await f.t.query(internal.catalogues.byId, { id: f.productId })
  expect(decode<RemoteResult>(p!.remote!).status).toBe(manual ? "complete" : "failed")
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
