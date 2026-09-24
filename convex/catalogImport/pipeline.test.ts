// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest"
import type { Doc } from "../_generated/dataModel"

const mock = vi.hoisted(() => ({
  objects: new Map<string, string>(),
  fetch: vi.fn(),
  failProductWrite: false,
  uploads: 0,
  parts: new Map<number, string>(),
}))
vi.mock("./network", () => ({
  fetchPublic: mock.fetch,
  renderedHtml: vi.fn(),
  CollectionHttpError: class extends Error {},
}))
vi.mock("./storage", () => ({
  getJson: async (key: string) =>
    mock.objects.has(key) ? JSON.parse(mock.objects.get(key)!) : null,
  getText: async (key: string) => mock.objects.get(key) ?? null,
  putText: async (key: string, body: string) => {
    mock.objects.set(key, body)
  },
  putJson: async (key: string, value: unknown) => {
    if (mock.failProductWrite && key.includes("/products/")) {
      mock.failProductWrite = false
      throw new Error("R2 interrupted")
    }
    mock.objects.set(key, JSON.stringify(value))
  },
  listKeys: async (prefix: string, cursor?: string, limit = 100) => {
    const all = [...mock.objects.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
    const start = Number(cursor ?? 0)
    return {
      keys: all.slice(start, start + limit),
      cursor: start + limit < all.length ? String(start + limit) : undefined,
    }
  },
  objectExists: async (key: string) => mock.objects.has(key),
  startMultipart: async () => {
    mock.uploads++
    return "upload-id"
  },
  uploadPart: async (
    _key: string,
    _upload: string,
    part: number,
    body: string,
  ) => {
    mock.parts.set(part, body)
  },
  finishMultipart: async (key: string) => {
    mock.objects.set(
      key,
      [...mock.parts]
        .sort(([a], [b]) => a - b)
        .map(([, body]) => body)
        .join(""),
    )
  },
}))
import { runExportTask, spec } from "./pipeline"
const base = {
  root: "catalog/test",
  origin: "https://source.example",
  type: "export",
  revision: 1,
  total: 1,
  done: 0,
  failed: 0,
  updatedAt: 1,
  preparationKey: "prep",
} as Doc<"catalogOperations">
const productJson = {
  product: {
    id: 12,
    handle: "plush",
    title: "Plush",
    variants: [
      { id: 13, price: "10.00", title: "Default", option1: "Default" },
    ],
    options: [{ name: "Title", values: ["Default"] }],
  },
}
const page =
  '<h1>Plush</h1><script>Shopify.currency = {"active":"EUR"}</script><main><details><summary>Material</summary><p>Cotton</p></details></main>'
async function task(key = "products-0") {
  return {
    ...(await spec(base.root, key, "products", {
      products: [
        {
          handle: "plush",
          url: `${base.origin}/products/plush`,
          collections: ["rabbit"],
        },
      ],
    })),
  } as Doc<"catalogTasks">
}
beforeEach(() => {
  vi.unstubAllEnvs()
  mock.objects.clear()
  mock.parts.clear()
  mock.fetch.mockReset()
  mock.uploads = 0
  mock.failProductWrite = false
  mock.objects.set(
    "prep",
    JSON.stringify({ revision: 1, collections: [], menu: [] }),
  )
})

test("unrecognized HTML reports the actual extraction error without requiring Browserless", async () => {
  vi.stubEnv("CATALOG_BROWSERLESS_URL", "")
  vi.stubEnv("CATALOG_BROWSERLESS_TOKEN", "")
  mock.fetch.mockResolvedValue("<html><body>Unknown theme</body></html>")
  const url = `${base.origin}/collections/rabbit`
  mock.objects.set(
    "collection-input",
    JSON.stringify({ url, collection: "rabbit", page: 1 }),
  )
  await expect(
    runExportTask(base, {
      kind: "collection",
      inputKey: "collection-input",
    } as Doc<"catalogTasks">),
  ).rejects.toThrow(
    `Lecture HTML impossible pour ${url} : Grille de collection non reconnue`,
  )
})

test("replays an R2 checkpoint after a product write crash with the original counter delta", async () => {
  mock.fetch.mockImplementation(async (url: string) =>
    url.endsWith(".json") ? JSON.stringify(productJson) : page,
  )
  const t = await task()
  mock.failProductWrite = true
  await expect(runExportTask(base, t)).rejects.toThrow("R2 interrupted")
  const recovered = await runExportTask(base, t)
  const replay = await runExportTask(base, t)
  expect(recovered).toMatchObject({ done: 1, failed: 0 })
  expect(replay).toEqual(recovered)
  expect(mock.fetch).toHaveBeenCalledTimes(2)
})

test("a targeted retry fetches only missing HTML and moves one failure to success", async () => {
  mock.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith(".json")) return JSON.stringify(productJson)
    throw new Error("offline")
  })
  expect(await runExportTask(base, await task())).toMatchObject({
    done: 0,
    failed: 1,
  })
  mock.fetch.mockClear().mockResolvedValue(page)
  expect(
    await runExportTask({ ...base, failed: 1 }, await task("retry-plush-1")),
  ).toMatchObject({ done: 1, failed: -1 })
  expect(mock.fetch).toHaveBeenCalledTimes(1)
  expect(mock.fetch).toHaveBeenCalledWith(`${base.origin}/products/plush`)
})

test("aliases confirmed by Shopify identity merge memberships and reduce the duplicate count", async () => {
  mock.fetch.mockImplementation(async (url: string) =>
    url.endsWith(".json") ? JSON.stringify(productJson) : page,
  )
  await runExportTask(base, await task())
  const alias = await spec(base.root, "products-alias", "products", {
    products: [
      {
        handle: "old-plush",
        url: `${base.origin}/products/old-plush`,
        collections: ["large"],
      },
    ],
  })
  expect(
    await runExportTask(
      { ...base, total: 2, done: 1 },
      alias as Doc<"catalogTasks">,
    ),
  ).toMatchObject({ done: 0, failed: 0, total: 1 })
  expect(
    JSON.parse(mock.objects.get(`${base.root}/products/plush.json`)!),
  ).toMatchObject({ collections: ["rabbit", "large"] })
})

test("a completed multipart object recovers a lost receipt and freezes import products", async () => {
  mock.fetch.mockImplementation(async (url: string) =>
    url.endsWith(".json") ? JSON.stringify(productJson) : page,
  )
  await runExportTask(base, await task())
  const assembly = await spec(base.root, "assemble-1", "assemble", {})
  const first = await runExportTask(
    { ...base, done: 1 },
    assembly as Doc<"catalogTasks">,
  )
  const second = await runExportTask(
    { ...base, done: 1 },
    assembly as Doc<"catalogTasks">,
  )
  expect(first.finalKey).toEqual(second.finalKey)
  expect(mock.uploads).toBe(1)
  expect(JSON.parse(mock.objects.get(first.finalKey!)!).products).toHaveLength(
    1,
  )
  expect(mock.objects.has(`${base.root}/final/1/products/plush.json`)).toBe(
    true,
  )
})
