// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest"
import type { Doc } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import { type CatalogProduct, type Preparation } from "./model"
import * as gql from "./graphql"
const mock = vi.hoisted(() => ({
  objects: new Map<string, unknown>(),
  graphql: vi.fn(),
}))
vi.mock("../shopify/client", () => ({ shopifyGraphql: mock.graphql }))
vi.mock("../shopScope", () => ({
  shopifyCredentialsForShop: () => ({
    domain: "target.myshopify.com",
    accessToken: "test",
  }),
}))
vi.mock("./storage", () => ({
  getJson: async (key: string) =>
    structuredClone(mock.objects.get(key) ?? null),
  putJson: async (key: string, value: unknown) => {
    mock.objects.set(key, structuredClone(value))
  },
  listKeys: async (prefix: string) => ({
    keys: [...mock.objects.keys()].filter((k) => k.startsWith(prefix)),
    cursor: undefined,
  }),
}))
import {
  runImportTask,
  uniqueIdentifier,
  remapDescription,
  mediaRetryInputs,
} from "./shopify"

test("media repair requires an exact source match regardless of Shopify ordering", () => {
  const files = [
    { originalSource: "https://source.example/one.jpg" },
    { originalSource: "https://source.example/two.jpg" },
  ]
  expect(
    mediaRetryInputs(
      [
        {
          id: "two",
          status: "FAILED",
          originalSource: { url: files[1].originalSource },
        },
        { id: "ambiguous", status: "FAILED", originalSource: null },
        {
          id: "one",
          status: "READY",
          originalSource: { url: files[0].originalSource },
        },
      ],
      files,
    ),
  ).toEqual([{ id: "two", originalSource: files[1].originalSource }])
  expect(
    mediaRetryInputs(
      [
        {
          id: "two",
          status: "FAILED",
          originalSource: { url: files[1].originalSource },
        },
      ],
      [files[1], files[1]],
    ),
  ).toEqual([])
})
const prep: Preparation = {
  revision: 1,
  menu: [],
  collections: [
    {
      key: "rabbit",
      title: "Lapin",
      targetTitle: "Lapin",
      keyword: "peluche lapin",
      tags: ["lapin"],
      selected: true,
      approved: true,
      match: "all",
      provenance: "manual",
      url: "https://source.example/collections/rabbit",
      description: "",
      seoTitle: "",
      seoDescription: "",
      image: null,
    },
  ],
}
const op = {
  _id: "import1",
  root: "import",
  origin: "https://source.example",
  type: "import",
  shopId: "shop",
  ownerId: "owner",
  sourceExportId: "export",
  sourceSnapshot: "frozen",
  selection: ["rabbit"],
  preparationKey: "prep",
  revision: 1,
  createdAt: Date.now(),
  done: 0,
  failed: 0,
} as unknown as Doc<"catalogOperations">
const ctx = {
  runQuery: async (_ref: unknown, args: { shopId?: string }) =>
    args.shopId ? { _id: "shop" } : { root: "live-mutable" },
} as unknown as ActionCtx
const task = {
  kind: "importProducts",
  key: "batch",
  inputKey: "",
} as Doc<"catalogTasks">
const product: CatalogProduct = {
  key: "123",
  sourceId: "123",
  handle: "plush",
  title: "Lapin",
  url: "https://source.example/products/plush",
  description: "",
  vendor: "",
  productType: "",
  sourceTags: [],
  options: [{ name: "Title", values: ["Default"] }],
  variants: [
    {
      id: "1",
      title: "Default",
      sku: "A",
      price: "12.00",
      currency: "EUR",
      compareAtPrice: null,
      options: ["Default"],
      weight: 1,
      weightUnit: "kg",
      imageId: null,
    },
  ],
  images: [],
  sections: [],
  seo: { title: "Lapin", description: "", canonical: "" },
  collections: ["rabbit"],
  jsonStatus: "complete",
  htmlStatus: "complete",
  errors: [],
  warnings: [],
  fetchedAt: 1,
}
beforeEach(() => {
  mock.objects.clear()
  mock.graphql.mockReset()
  vi.unstubAllGlobals()
  mock.objects.set("prep", prep)
  mock.objects.set("import/state.json", {
    collections: { rabbit: { id: "collection1", handle: "rabbit" } },
    domain: "https://target.example",
    currency: "EUR",
  })
  mock.objects.set("frozen/products/plush.json", product)
})
test("reimport reads frozen data and only adds tags to an existing source identity", async () => {
  mock.graphql.mockImplementation(async (query: string, variables: unknown) => {
    if (query === gql.FIND_PRODUCT) {
      expect(variables).toEqual({
        identifier: { customId: uniqueIdentifier(op.origin, "123") },
      })
      return {
        productByIdentifier: {
          id: "target1",
          handle: "plush",
          tags: ["manual"],
        },
      }
    }
    if (query === gql.TAGS_ADD) {
      expect(variables).toEqual({ id: "target1", tags: ["lapin"] })
      return { tagsAdd: { userErrors: [] } }
    }
    if (query === gql.VERIFY_PRODUCT)
      return {
        product: {
          id: "target1",
          tags: ["manual", "lapin"],
          media: { nodes: [], pageInfo: { hasNextPage: false } },
          collections: {
            nodes: [{ id: "collection1" }],
            pageInfo: { hasNextPage: false },
          },
        },
      }
    throw new Error("Unexpected Shopify mutation")
  })
  const outcome = await runImportTask(ctx, op, task)
  expect(outcome).toMatchObject({ complete: true, done: 1, failed: 0 })
  expect(mock.graphql).toHaveBeenCalledTimes(3)
  expect(mock.objects.has("import/mappings/123.json")).toBe(true)
})
test("lost submission response reconciles a known operation before any new mutation", async () => {
  mock.objects.set("import/bulk/batch.json", {
    lines: [{ handle: "plush", sourceId: "123", input: {}, identifier: {} }],
    existing: 0,
    failed: 0,
    submitted: true,
  })
  mock.graphql.mockResolvedValue({ bulkOperations: { nodes: [] } })
  await expect(runImportTask(ctx, op, task)).rejects.toThrow("incertaine")
  expect(
    mock.graphql.mock.calls.every(([query]) => query === gql.BULK_RECENT),
  ).toBe(true)
})

test("existing products wait for automatic membership and report a bounded verification failure", async () => {
  mock.graphql.mockImplementation(async (query: string) => {
    if (query === gql.FIND_PRODUCT)
      return {
        productByIdentifier: {
          id: "target1",
          handle: "plush",
          tags: ["manual"],
        },
      }
    if (query === gql.TAGS_ADD) return { tagsAdd: { userErrors: [] } }
    if (query === gql.VERIFY_PRODUCT)
      return {
        product: {
          id: "target1",
          tags: ["manual", "lapin"],
          media: { nodes: [], pageInfo: { hasNextPage: false } },
          collections: { nodes: [], pageInfo: { hasNextPage: false } },
        },
      }
    throw new Error("Unexpected Shopify mutation")
  })
  expect(await runImportTask(ctx, op, task)).toMatchObject({ complete: false })
  expect(mock.objects.has("import/mappings/123.json")).toBe(false)
  mock.objects.set("import/bulk/batch-existing-123.json", {
    startedAt: Date.now() - 6 * 60_000,
  })
  expect(await runImportTask(ctx, op, task)).toMatchObject({
    complete: true,
    done: 0,
    failed: 1,
  })
  expect(
    mock.objects.get("import/errors/plush-verification.json"),
  ).toMatchObject({ missingCollections: ["collection1"] })
})
test("partial Shopify results cannot count absent lines as successful imports", async () => {
  mock.objects.set("import/bulk/batch.json", {
    lines: [
      { handle: "one", sourceId: "1" },
      { handle: "two", sourceId: "2" },
    ],
    existing: 0,
    failed: 0,
    submitted: true,
    bulkId: "bulk1",
  })
  mock.graphql.mockResolvedValue({
    node: {
      status: "FAILED",
      url: null,
      partialDataUrl: "https://shopify.example/result",
      errorCode: "INTERNAL_SERVER_ERROR",
    },
  })
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            __lineNumber: 0,
            data: {
              productSet: {
                product: null,
                userErrors: [{ message: "Invalid input" }],
              },
            },
          }),
        ),
    ),
  )
  const first = await runImportTask(ctx, op, task)
  const replay = await runImportTask(ctx, op, task)
  expect(first).toMatchObject({ done: 0, failed: 2, complete: true })
  expect(replay).toEqual(first)
})

test("the link pass uses target handles and reports missing destinations without foreign links", async () => {
  const rewritten = await remapDescription(
    {
      ...product,
      description:
        '<p><a href="/products/plush">P</a><a href="/collections/rabbit">C</a><a href="/pages/unknown">X</a></p>',
    },
    op.origin,
    {
      collections: { rabbit: { id: "c", handle: "lapin" } },
      domain: "https://target.example",
      currency: "EUR",
    },
    async () => ({ id: "p", handle: "peluche" }),
  )
  expect(rewritten.html).toContain(
    'href="https://target.example/products/peluche"',
  )
  expect(rewritten.html).toContain(
    'href="https://target.example/collections/lapin"',
  )
  expect(rewritten.unresolved).toEqual(["/pages/unknown"])
})
