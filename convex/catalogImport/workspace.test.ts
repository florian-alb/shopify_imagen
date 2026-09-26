/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { api, internal } from "../_generated/api"
import {
  resolveWorkspace,
  searchCode,
  searchEntries,
  indexEntries,
} from "./workspaceModel"
import type { CatalogProduct, CollectionPlan, Preparation } from "./model"
const modules = import.meta.glob("../**/*.ts")
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const plan = (
  key: string,
  tags: string[],
  match: "all" | "any" = "all",
): CollectionPlan => ({
  key,
  tags,
  match,
  title: key,
  targetTitle: key,
  url: `https://source.example/collections/${key}`,
  keyword: "",
  description: "",
  seoTitle: "",
  seoDescription: "",
  image: null,
  selected: true,
  approved: true,
  provenance: "source",
})
const prep: Preparation = {
  revision: 2,
  collections: [
    plan("rabbit", ["rabbit"]),
    plan("large", ["large"]),
    plan("both", ["rabbit", "large"]),
  ],
  menu: [{ key: "rabbit", title: "Lapins", url: null, children: [] }],
}
function product(handle = "rabbit", title = "Großer Hase"): CatalogProduct {
  return {
    key: handle,
    sourceId: handle,
    handle,
    title,
    url: `https://source.example/products/${handle}`,
    description: "<p>Original</p>",
    vendor: "source",
    productType: "animal",
    sourceTags: ["Deutsch"],
    options: [],
    variants: [
      {
        id: "1",
        title: "20 cm",
        sku: "a",
        price: "12.99",
        currency: "EUR",
        compareAtPrice: null,
        options: ["20 cm"],
        weight: 0,
        weightUnit: "g",
        imageId: null,
      },
    ],
    images: [],
    sections: [],
    seo: { title, description: "SEO", canonical: "" },
    collections: ["rabbit", "large"],
    jsonStatus: "complete",
    htmlStatus: "complete",
    errors: [],
    warnings: [],
    fetchedAt: 1,
  }
}
async function seed() {
  const t = convexTest(schema, modules)
  const owner = await t.run((ctx) =>
    ctx.db.insert("users", { approvalStatus: "approved" }),
  )
  const other = await t.run((ctx) =>
    ctx.db.insert("users", { approvalStatus: "approved" }),
  )
  const id = await t.run((ctx) =>
    ctx.db.insert("catalogOperations", {
      ownerId: owner,
      origin: "https://source.example",
      mode: "menu",
      type: "export",
      status: "partial",
      phase: "products",
      root: "isolated/actual-root",
      preparationKey: "prep/2",
      revision: 2,
      total: 1,
      done: 1,
      failed: 0,
      generation: 7,
      createdAt: 1,
      updatedAt: 1,
    }),
  )
  const user = t.withIdentity({ subject: owner })
  await t.mutation(internal.catalogWorkspace.beginMigration, {
    id,
    owner,
    preparation: JSON.stringify(prep),
    fingerprint: "prep-hash",
  })
  return { t, user, id, owner, other }
}
async function add(
  seedValue: Awaited<ReturnType<typeof seed>>,
  p = product(),
  override = {},
) {
  return seedValue.t.mutation(internal.catalogWorkspace.migrateOne, {
    id: seedValue.id,
    version: 1,
    json: JSON.stringify(p),
    override: JSON.stringify(override),
    fingerprint: "source-hash",
  })
}
async function publish(s: Awaited<ReturnType<typeof seed>>, count = 1) {
  await s.t.run((ctx) => ctx.db.patch(s.id, { total: count, done: count }))
  await s.t.mutation(internal.catalogWorkspace.migrationProgress, {
    id: s.id,
    version: 1,
    count,
    expectedStage: "copy",
    stage: "validate",
  })
  await s.t.mutation(internal.catalogWorkspace.migrationProgress, {
    id: s.id,
    version: 1,
    count,
    expectedStage: "validate",
    stage: "ready",
  })
  await s.t.mutation(internal.catalogWorkspace.publishMigration, {
    id: s.id,
    fingerprint: "prep-hash",
  })
}
test("resolution preserves overrides, AND/OR, source memberships and size warnings", () => {
  const rules = {
    ...prep,
    collections: [
      ...prep.collections,
      { ...plan("big", ["large"]), minSizeCm: 90 },
    ],
  }
  const p = { ...product(), collections: ["rabbit", "large", "big"] }
  const r = resolveWorkspace(p, rules, { tags: ["rabbit"], reviewed: true })
  expect(r.product.tags).toEqual(["rabbit"])
  expect(r.scopes).toEqual(["", "rabbit"])
  expect(r.product.collections).toEqual(p.collections)
  expect(r.product.warnings).toHaveLength(1)
  expect(r.issues).toBe(false)
  const inherited = resolveWorkspace(p, rules, {})
  expect(inherited.scopes).toContain("big")
})
test("suffix ranges preserve includes for punctuation, case, whitespace and Unicode", () => {
  const title = "Éléphant  🐰 STRAẞE / aaaa"
  for (const query of ["ÉLÉ", "  🐰", "ße /", "aa", "a", "t  ", "unknown"]) {
    const lower = title.toLowerCase(),
      search = query.toLowerCase(),
      prefix = searchCode(search)
    const hits = searchEntries(title, "x").filter(
      (e) =>
        e.sort.startsWith(prefix) &&
        e.minLength <= search.length &&
        e.position === lower.indexOf(search),
    )
    expect(hits.length).toBe(Number(lower.includes(search)))
  }
})
test("migration replay is idempotent, preserves unknown source fields and has no R2 dependencies in reads", async () => {
  const s = await seed()
  const p = { ...product(), unknownFutureField: { original: true } }
  await add(s, p, { title: "Correction", tags: ["rabbit"], excluded: true })
  await add(s, p, { title: "Correction", tags: ["rabbit"], excluded: true })
  await publish(s)
  const page = await s.user.query(api.catalogWorkspace.products, { id: s.id })
  expect(JSON.parse(page.json)).toHaveLength(1)
  expect(JSON.parse(page.json)[0]).toMatchObject({
    title: "Correction",
    tags: ["rabbit"],
    excluded: true,
    variants: 1,
  })
  expect(JSON.parse(page.json)[0]).not.toHaveProperty("description")
  const detail = JSON.parse(
    await s.user.query(api.catalogWorkspace.product, {
      id: s.id,
      handle: "rabbit",
    }),
  )
  expect(detail.unknownFutureField).toEqual({ original: true })
  expect(detail.description).toBe(p.description)
  await expect(
    s.t
      .withIdentity({ subject: s.other })
      .query(api.catalogWorkspace.products, { id: s.id }),
  ).rejects.toThrow("inaccessible")
  await expect(
    s.t
      .withIdentity({ subject: s.other })
      .query(api.catalogWorkspace.product, { id: s.id, handle: "rabbit" }),
  ).rejects.toThrow("inaccessible")
})
test("pagination searches the full indexed scope without duplicate titles or empty filter pages", async () => {
  const s = await seed()
  for (let i = 0; i < 57; i++)
    await add(s, product(`h${String(i).padStart(3, "0")}`, `aaaa ${i}`))
  await publish(s, 57)
  const first = await s.user.query(api.catalogWorkspace.products, {
    id: s.id,
    collection: "both",
    search: "aa",
  })
  const second = await s.user.query(api.catalogWorkspace.products, {
    id: s.id,
    collection: "both",
    search: "aa",
    cursor: first.cursor!,
  })
  expect(JSON.parse(first.json)).toHaveLength(50)
  expect(JSON.parse(second.json)).toHaveLength(7)
  expect(
    new Set(
      [...JSON.parse(first.json), ...JSON.parse(second.json)].map(
        (p) => p.handle,
      ),
    ).size,
  ).toBe(57)
  expect(second.cursor).toBeNull()
  const reset = await s.user.query(api.catalogWorkspace.products, {
    id: s.id,
    search: "aaa",
    cursor: first.cursor!,
  })
  expect(reset.reset).toBe(true)
  const unknownCollection = await s.user.query(api.catalogWorkspace.products, {
    id: s.id,
    collection: "missing-legacy-key",
  })
  expect(JSON.parse(unknownCollection.json)).toHaveLength(50)
})

test("source chunks preserve Unicode and unknown source fields; duplicate source identities are refused", async () => {
  const s = await seed()
  const p = {
    ...product(),
    description: "é".repeat(99_500) + "🐇".repeat(500),
    futureSourceField: { retained: true },
  }
  await add(s, p)
  const stored = await s.t.query(internal.catalogWorkspace.inspectSource, {
    id: s.id,
    handle: p.handle,
  })
  if (!stored) throw new Error("Expected migrated source")
  expect(stored.product).toEqual(p)
  expect(stored.source.chunks).toBeGreaterThan(1)
  const chunks = await s.t.run((ctx) => ctx.db.query("catalogBodies").collect())
  expect(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c.json))).toBe(true)
  await expect(add(s, { ...p, handle: "alias" })).rejects.toThrow(
    "Alias source",
  )
})
test("edits resolve membership atomically, enforce revision and replay without double application", async () => {
  const s = await seed()
  await add(s)
  await publish(s)
  const args = {
    id: s.id,
    owner: s.owner,
    revision: 2,
    handle: "rabbit",
    patch: JSON.stringify({ tags: ["rabbit"] }),
    request: "edit-1",
  }
  expect(await s.t.mutation(internal.catalogWorkspace.saveProduct, args)).toBe(
    3,
  )
  expect(await s.t.mutation(internal.catalogWorkspace.saveProduct, args)).toBe(
    3,
  )
  expect(
    JSON.parse(
      (
        await s.user.query(api.catalogWorkspace.products, {
          id: s.id,
          collection: "both",
        })
      ).json,
    ),
  ).toEqual([])
  await expect(
    s.t.mutation(internal.catalogWorkspace.saveProduct, {
      ...args,
      request: "different",
    }),
  ).rejects.toThrow("changé")
  await expect(
    s.t.mutation(internal.catalogWorkspace.rollback, {
      id: s.id,
      owner: s.owner,
    }),
  ).rejects.toThrow("Retour legacy interdit")
})
test("rule rebuild keeps old version visible and rejects edits until atomic publication", async () => {
  const s = await seed()
  await add(s)
  await publish(s)
  await s.t.mutation(internal.catalogWorkspace.saveStructure, {
    id: s.id,
    owner: s.owner,
    revision: 2,
    json: JSON.stringify({
      ...prep,
      collections: prep.collections.map((c) =>
        c.key === "both" ? { ...c, tags: ["fox"] } : c,
      ),
    }),
    request: "rules-1",
  })
  expect(
    JSON.parse(
      (
        await s.user.query(api.catalogWorkspace.products, {
          id: s.id,
          collection: "both",
        })
      ).json,
    ),
  ).toHaveLength(1)
  await expect(
    s.user.mutation(api.catalogImport.control, { id: s.id, command: "resume" }),
  ).rejects.toThrow("classements")
  await s.t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    JSON.parse(
      (
        await s.user.query(api.catalogWorkspace.products, {
          id: s.id,
          collection: "both",
        })
      ).json,
    ),
  ).toHaveLength(0)
})
test("source changes and incomplete validation cannot publish; rollback before edits restores legacy", async () => {
  const s = await seed()
  await add(s)
  await expect(
    s.t.mutation(internal.catalogWorkspace.publishMigration, {
      id: s.id,
      fingerprint: "prep-hash",
    }),
  ).rejects.toThrow("incomplète")
  await s.t.run((ctx) => ctx.db.patch(s.id, { generation: 8 }))
  await expect(add(s)).rejects.toThrow("source a changé")
  await s.t.run((ctx) => ctx.db.patch(s.id, { generation: 7 }))
  await publish(s)
  await s.t.mutation(internal.catalogWorkspace.rollback, {
    id: s.id,
    owner: s.owner,
  })
  expect(
    (await s.user.query(api.catalogImport.get, { id: s.id })).storageMode,
  ).toBeUndefined()
})
test("stale collection workers and edits during a paused snapshot are rejected", async () => {
  const s = await seed()
  await add(s)
  await publish(s)
  const taskId = await s.t.run((ctx) =>
    ctx.db.insert("catalogTasks", {
      operationId: s.id,
      key: "assemble",
      kind: "assemble",
      inputKey: "input",
      status: "running",
      generation: 8,
      attempts: 1,
      nextAt: 0,
      createdAt: 1,
      updatedAt: 1,
    }),
  )
  await s.t.run((ctx) =>
    ctx.db.patch(s.id, {
      generation: 8,
      activeTaskId: taskId,
      snapshotRevision: 2,
    }),
  )
  const page = await s.t.query(internal.catalogWorkspace.snapshotPage, {
    id: s.id,
    revision: 2,
    generation: 8,
  })
  expect(page.products[0].tags).toEqual(["large", "rabbit"])
  await expect(
    s.t.mutation(internal.catalogWorkspace.collected, {
      id: s.id,
      taskId,
      generation: 7,
      json: JSON.stringify(product()),
      fingerprint: "x",
    }),
  ).rejects.toThrow("périmé")
  await s.t.run((ctx) =>
    ctx.db.patch(s.id, { status: "paused", activeTaskId: undefined }),
  )
  await expect(
    s.t.mutation(internal.catalogWorkspace.saveProduct, {
      id: s.id,
      owner: s.owner,
      revision: 2,
      handle: "rabbit",
      patch: "{}",
      request: "paused-edit",
    }),
  ).rejects.toThrow("traitement")
})
test("index expansion has an explicit atomic-write budget", () => {
  const resolved = resolveWorkspace(
    product(
      "long",
      Array.from({ length: 1000 }, (_, i) =>
        String.fromCharCode(1000 + i),
      ).join(""),
    ),
    prep,
    {},
  )
  expect(() => indexEntries(resolved)).toThrow("trop volumineux")
})

test("minimal-prefix partitions return each substring exactly once, including repeated characters", () => {
  for (const title of [
    "aaaaa",
    "ababa",
    "aaaaXaaaaY",
    "Éléphant éléphant",
    "🐰🐰 lapin",
    "abcabcabcxyzabc",
  ]) {
    const lower = title.toLowerCase(),
      entries = searchEntries(title, "test")
    for (let i = 0; i < lower.length; i++)
      for (let end = i + 1; end <= lower.length; end++) {
        const search = lower.slice(i, end),
          prefix = searchCode(search)
        const hits = entries.filter(
          (e) =>
            e.minLength > 0 &&
            e.minLength <= search.length &&
            e.sort.startsWith(prefix),
        )
        expect(hits.map((e) => e.position)).toEqual([lower.indexOf(search)])
      }
  }
})
