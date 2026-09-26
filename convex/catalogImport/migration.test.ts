// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { beforeEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { internal, api } from "../_generated/api"
const modules = import.meta.glob("../**/*.ts")
const mock = vi.hoisted(() => ({
  objects: new Map<string, unknown>(),
  writes: vi.fn(() => {
    throw new Error("Unexpected external write")
  }),
}))
vi.mock("./storage", () => ({
  getJson: async (key: string) =>
    mock.objects.has(key) ? structuredClone(mock.objects.get(key)) : null,
  listKeys: async (prefix: string, cursor?: string, limit = 100) => {
    const keys = [...mock.objects.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
    const offset = Number(cursor ?? 0)
    return {
      keys: keys.slice(offset, offset + limit),
      cursor: offset + limit < keys.length ? String(offset + limit) : undefined,
    }
  },
  putJson: mock.writes,
  putText: mock.writes,
  getText: mock.writes,
  startMultipart: mock.writes,
  uploadPart: mock.writes,
  finishMultipart: mock.writes,
  objectExists: mock.writes,
}))
beforeEach(() => {
  mock.objects.clear()
  mock.writes.mockClear()
})
async function seed() {
  const t = convexTest(schema, modules)
  const owner = await t.run((ctx) =>
    ctx.db.insert("users", { approvalStatus: "approved" }),
  )
  const id = await t.run((ctx) =>
    ctx.db.insert("catalogOperations", {
      ownerId: owner,
      origin: "https://source.example",
      type: "export",
      mode: "menu",
      status: "partial",
      phase: "products",
      root: "actual/moved-root",
      preparationKey: "prep",
      revision: 2,
      total: 26,
      done: 26,
      failed: 0,
      generation: 3,
      createdAt: 0,
      updatedAt: 0,
    }),
  )
  mock.objects.set("prep", { revision: 2, collections: [], menu: [] })
  for (let i = 0; i < 26; i++) {
    const handle = `p${String(i).padStart(2, "0")}`
    mock.objects.set(`actual/moved-root/products/${handle}.json`, {
      key: handle,
      handle,
      sourceId: handle,
      title: handle,
      url: `https://source.example/products/${handle}`,
      description: "original",
      vendor: "",
      productType: "",
      sourceTags: [],
      options: [],
      variants: [],
      images: [],
      sections: [],
      seo: { title: handle, description: "", canonical: "" },
      collections: [],
      jsonStatus: "complete",
      htmlStatus: "complete",
      errors: [],
      warnings: [],
      fetchedAt: 0,
    })
    mock.objects.set(`actual/moved-root/summaries/${handle}.json`, {
      handle,
      title: handle,
      collections: [],
      partial: false,
    })
  }
  const step = (
    command: "dry-run" | "begin" | "step" | "publish" | "rollback",
  ) => t.action(internal.catalogMigration.step, { id, command })
  return { t, id, owner, step }
}
test("dry-run writes nothing; interrupted migration resumes, validates and replays safely", async () => {
  const s = await seed()
  expect(await s.step("dry-run")).toMatchObject({ products: 25 })
  expect(
    await s.t.query(internal.catalogWorkspace.context, { id: s.id }),
  ).toBeNull()
  await s.step("begin")
  await s.step("step")
  const checkpoint = await s.t.query(internal.catalogWorkspace.context, {
    id: s.id,
  })
  expect(checkpoint).toMatchObject({ stage: "copy", count: 25, cursor: "25" })
  await s.step("begin") // process restart
  await s.step("step")
  await s.step("step")
  await s.step("step")
  expect(
    await s.t.query(internal.catalogWorkspace.context, { id: s.id }),
  ).toMatchObject({ stage: "ready", count: 26, validated: 26 })
  await s.step("publish")
  await s.step("publish")
  expect(await s.step("step")).toMatchObject({ mode: "active" })
  const page = await s.t
    .withIdentity({ subject: s.owner })
    .query(api.catalogWorkspace.products, { id: s.id })
  expect(JSON.parse(page.json)).toHaveLength(26)
  await s.step("rollback")
  expect(
    (await s.t.query(internal.catalogImport.context, { id: s.id })).storageMode,
  ).toBeUndefined()
  expect(mock.writes).not.toHaveBeenCalled()
})
test("missing corrections and changed source files prevent publication", async () => {
  const s = await seed()
  mock.objects.set("prep", {
    revision: 2,
    collections: [],
    menu: [],
    overrideBuckets: { "1": "missing-override" },
  })
  await expect(s.step("dry-run")).rejects.toThrow("Corrections absentes")
  mock.objects.set("prep", { revision: 2, collections: [], menu: [] })
  await s.step("begin")
  await s.step("step")
  await s.step("step")
  const p = mock.objects.get("actual/moved-root/products/p00.json") as {
    title: string
  }
  p.title = "Changed externally"
  await expect(s.step("step")).rejects.toThrow("Résumé source divergent")
  await expect(s.step("publish")).rejects.toThrow("incomplète")
})
test("checkpoint compare-and-set rejects duplicate completion and index corruption", async () => {
  const s = await seed()
  await s.step("begin")
  await s.step("step")
  await expect(
    s.t.mutation(internal.catalogWorkspace.migrationProgress, {
      id: s.id,
      version: 1,
      expectedStage: "copy",
      count: 25,
      stage: "copy",
      cursor: "25",
    }),
  ).rejects.toThrow("Checkpoint")
  await s.t.run(async (ctx) => {
    const row = await ctx.db
      .query("catalogRows")
      .withIndex("by_operationId_and_version_and_handle", (q) =>
        q.eq("operationId", s.id).eq("version", 1).eq("handle", "p00"),
      )
      .unique()
    await ctx.db.patch(row!._id, { row: "{}" })
  })
  await expect(
    s.t.query(internal.catalogWorkspace.validateMaterialized, {
      id: s.id,
      handle: "p00",
    }),
  ).rejects.toThrow("Résumé différent")
})

test("migration refuses stale summaries and normalization-dependent legacy membership", async () => {
  const s = await seed()
  const path = "actual/moved-root/summaries/p00.json"
  mock.objects.set(path, {
    handle: "p00",
    title: "stale",
    collections: [],
    partial: false,
  })
  await expect(s.step("dry-run")).rejects.toThrow("Résumé source divergent")
  mock.objects.set(path, {
    handle: "p00",
    title: "p00",
    collections: ["rabbit"],
    partial: false,
  })
  const source = mock.objects.get("actual/moved-root/products/p00.json") as {
    collections: string[]
  }
  source.collections = ["rabbit"]
  mock.objects.set("prep", {
    revision: 2,
    menu: [],
    collections: [
      {
        key: "rabbit",
        title: "Rabbit",
        targetTitle: "Rabbit",
        url: "",
        tags: [" rabbit "],
        selected: true,
        approved: true,
        match: "all",
      },
    ],
  })
  await expect(s.step("dry-run")).rejects.toThrow(
    "Appartenance legacy divergente",
  )
  expect(mock.writes).not.toHaveBeenCalled()
})
