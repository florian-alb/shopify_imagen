/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import schema from "../schema"
import { api, internal } from "../_generated/api"
const modules = import.meta.glob("../**/*.ts")
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
async function seed() {
  const t = convexTest(schema, modules)
  const owner = await t.run((ctx) =>
    ctx.db.insert("users", { approvalStatus: "approved" }),
  )
  const other = await t.run((ctx) =>
    ctx.db.insert("users", { approvalStatus: "approved" }),
  )
  const user = t.withIdentity({ subject: owner })
  const id = await user.mutation(api.catalogImport.create, {
    url: "https://source.example",
    mode: "menu",
  })
  return { t, owner, other, user, id }
}
test("export reads, edits and destination shops are owner scoped", async () => {
  const { t, owner, other, id } = await seed()
  await expect(
    t.withIdentity({ subject: other }).query(api.catalogImport.get, { id }),
  ).rejects.toThrow("inaccessible")
  await expect(
    t
      .withIdentity({ subject: other })
      .mutation(api.catalogImport.control, { id, command: "cancel" }),
  ).rejects.toThrow("inaccessible")
  const shopId = await t.run((ctx) =>
    ctx.db.insert("shops", {
      createdByUserId: owner,
      domain: "test.myshopify.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  )
  await expect(
    t.query(internal.catalogImport.importShop, { shopId, owner: other }),
  ).rejects.toThrow("inaccessible")
  expect(
    await t
      .withIdentity({ subject: other })
      .query(api.catalogImport.destinationShops),
  ).toEqual([])
})
test("one worker holds the lease, stale workers cannot settle, receipt replay counts once", async () => {
  const { t, id, user } = await seed()
  const first = (await t.mutation(internal.catalogImport.claim, { id }))!
  expect(await t.mutation(internal.catalogImport.claim, { id })).toBeNull()
  await t.run((ctx) => ctx.db.patch(id, { leaseUntil: Date.now() - 1 }))
  const newer = (await t.mutation(internal.catalogImport.claim, { id }))!
  const receipt = {
    id,
    taskId: first.task._id,
    resultKey: "r2/receipt",
    tasks: [],
    complete: true,
    done: 3,
  }
  expect(
    await t.mutation(internal.catalogImport.settle, {
      ...receipt,
      generation: first.op.generation,
    }),
  ).toBe(false)
  expect(
    await t.mutation(internal.catalogImport.settle, {
      ...receipt,
      generation: newer.op.generation,
    }),
  ).toBe(true)
  expect(
    await t.mutation(internal.catalogImport.settle, {
      ...receipt,
      generation: newer.op.generation,
    }),
  ).toBe(false)
  expect((await user.query(api.catalogImport.get, { id })).done).toBe(3)
})
test("pause preserves the active checkpoint and never schedules continued work", async () => {
  const { t, user, id } = await seed()
  const claimed = (await t.mutation(internal.catalogImport.claim, { id }))!
  await user.mutation(api.catalogImport.control, { id, command: "pause" })
  await t.mutation(internal.catalogImport.settle, {
    id,
    taskId: claimed.task._id,
    generation: claimed.op.generation,
    resultKey: "receipt",
    tasks: [],
    complete: false,
    inputKey: "next",
  })
  expect((await user.query(api.catalogImport.get, { id })).status).toBe(
    "paused",
  )
  expect(await t.mutation(internal.catalogImport.claim, { id })).toBeNull()
})
test("AI usage is tracked without requiring or enforcing a total budget", async () => {
  const { t, user, id, owner } = await seed()
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { aiBudget: 1 })
  })
  await t.mutation(internal.catalogImport.reserveAi, {
    id,
    owner,
    tokens: 66000,
  })
  await t.mutation(internal.catalogImport.reserveAi, {
    id,
    owner,
    tokens: 66000,
  })
  await t.mutation(internal.catalogImport.reconcileAi, {
    id,
    reserved: 66000,
    used: 1200,
  })
  expect((await user.query(api.catalogImport.get, { id })).aiUsed).toBe(67200)
})
