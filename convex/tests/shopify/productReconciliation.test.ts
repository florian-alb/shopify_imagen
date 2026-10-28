// @vitest-environment node
/// <reference types="vite/client" />
import workflowTest from "@convex-dev/workflow/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { shopifyGraphql } from "../../shopify/client"
import { PRODUCTS_QUERY, PRODUCT_QUERY } from "../../shopify/graphql"
import { missingProductIds, PRODUCT_PRESENCE_QUERY } from "../../shopify/productSyncHelpers"

vi.mock("../../shopify/client", () => ({ shopifyGraphql: vi.fn(), getAccessToken: vi.fn() }))
const modules = import.meta.glob("../../**/*.ts")
const graphql = vi.mocked(shopifyGraphql)
beforeEach(() => { vi.useFakeTimers(); graphql.mockReset() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

function remoteProduct(id = "gid://shopify/Product/1") {
  return { id, title: "Visible dans Shopify", handle: "visible", status: "ACTIVE",
    variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }
}
function catalogue() {
  graphql.mockImplementation(async (query, variables, _token, credentials) => {
    expect(credentials?.domain).toBe("reconcile.myshopify.com")
    if (query === PRODUCTS_QUERY) return { products: { nodes: [remoteProduct()], pageInfo: { hasNextPage: false, endCursor: "end" } } }
    if (query === PRODUCT_PRESENCE_QUERY) return { nodes: (variables.ids as string[]).map(id =>
      id === "gid://shopify/Product/3" ? null : { __typename: "Product", id }) }
    throw new Error("Unexpected Shopify operation")
  })
}
async function fixture() {
  const t = convexTest({ schema, modules, transactionLimits: true })
  workflowTest.register(t)
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" })
    const shopId = await ctx.db.insert("shops", { domain: "reconcile.myshopify.com", clientId: "fixture", clientSecret: "fixture",
      productQuery: "vendor:OnlySelectedProducts", createdByUserId: userId, createdAt: 1, updatedAt: 1 })
    const otherShop = await ctx.db.insert("shops", { domain: "other.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1 })
    await ctx.db.patch(userId, { activeShopId: shopId })
    const makeProduct = (index: number, owner = shopId): Omit<Doc<"products">, "_id" | "_creationTime"> => ({
      shopId: owner, shopifyProductId: `gid://shopify/Product/${index}`, title: index === 3 ? "Livia supprimé" : `Produit ${index}`,
      handle: `produit-${index}`, tags: [], collections: [], options: [], variants: [], metafields: [], currentShopifyImages: [],
      generationStatus: "ready", lastSyncedAt: 1, createdAt: 1, updatedAt: 1,
    })
    const visible = await ctx.db.insert("products", makeProduct(1))
    const filtered = await ctx.db.insert("products", makeProduct(2))
    const missing = await ctx.db.insert("products", { ...makeProduct(3), vibe: "Correction conservée" })
    const other = await ctx.db.insert("products", makeProduct(3, otherShop))
    const variant = await ctx.db.insert("productVariants", { shopId, productId: missing, shopifyVariantId: "gid://shopify/ProductVariant/30",
      title: "Taille 38", sku: "old", selectedOptions: [], gender: null, ageGroup: null, lastSyncedAt: 1, updatedAt: 1 })
    const draft = await ctx.db.insert("googleFeedDrafts", { shopId, createdByUserId: userId, productId: missing, variantId: variant,
      ownerId: "gid://shopify/ProductVariant/30", ownerType: "PRODUCTVARIANT", attribute: "gender", currentValue: null,
      proposedValue: "female", sourceKind: "manual", sourceLabel: "Correction manuelle", status: "draft", included: true, createdAt: 1, updatedAt: 1 })
    const history = await ctx.db.insert("googleFeedRuns", { shopId, createdByUserId: userId, kind: "publication", source: "manual", status: "partial",
      totalItems: 2, succeededItems: 1, failedItems: 1, skippedItems: 0, conflictItems: 0, createdAt: 1, updatedAt: 1, completedAt: 1 })
    const historyItem = await ctx.db.insert("googleFeedRunItems", { shopId, runId: history, draftId: draft, productId: missing, variantId: variant,
      ownerId: "gid://shopify/ProductVariant/30", ownerType: "PRODUCTVARIANT", attribute: "gender", oldValue: null, newValue: "female",
      sourceLabel: "Correction manuelle", status: "confirmed", createdAt: 1, updatedAt: 1 })
    return { userId, shopId, otherShop, visible, filtered, missing, other, variant, draft, history, historyItem }
  })
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids }
}
async function snapshot(t: Awaited<ReturnType<typeof fixture>>["t"], id: Id<"products">) {
  const product = await t.run(ctx => ctx.db.get(id))
  if (!product) throw new Error("Missing fixture")
  return { id, shopifyProductId: product.shopifyProductId, updatedAt: product.updatedAt, lastSyncedAt: product.lastSyncedAt }
}

describe("durable full Shopify reconciliation", () => {
  test("scans completely, verifies filtered-out products, archives confirmed missing and preserves historical identities", async () => {
    const { t, client, missing, filtered, other, variant, draft, history, historyItem } = await fixture()
    catalogue()
    const oldHistory = await t.run(ctx => ctx.db.get(historyItem))
    const runId = await client.mutation(api.productSync.start, {})
    expect(await client.mutation(api.productSync.start, {})).toBe(runId)
    await t.finishAllScheduledFunctions(vi.runAllTimers, 150)
    expect(await client.query(api.productSync.status, { runId })).toMatchObject({ status: "completed", synced: 1, checked: 2, removed: 1 })
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeTypeOf("number")
    expect((await t.run(ctx => ctx.db.get(filtered)))?.shopifyDeletedAt).toBeUndefined()
    expect((await t.run(ctx => ctx.db.get(other)))?.shopifyDeletedAt).toBeUndefined()
    expect(await t.run(ctx => ctx.db.get(variant))).not.toBeNull()
    expect(await t.run(ctx => ctx.db.get(draft))).toMatchObject({ included: false, sourceKind: "manual", proposedValue: "female" })
    expect(await t.run(ctx => ctx.db.get(historyItem))).toEqual(oldHistory)
    expect((await client.query(api.googleFeed.runDetails, { runId: history, limit: 10 })).items).toHaveLength(1)
    expect((await client.query(api.googleFeedWorkspace.listProducts, { view: "ready" })).products).toEqual([])
    expect((await client.query(api.products.navigation, {})).total).toBe(2)
    expect((await client.query(api.products.getWithImages, { productId: missing }))?.product.vibe).toBe("Correction conservée")
    const presence = graphql.mock.calls.filter(([query]) => query === PRODUCT_PRESENCE_QUERY)
    expect(presence[0][1]).toEqual({ ids: expect.arrayContaining(["gid://shopify/Product/2", "gid://shopify/Product/3"]) })
    expect(presence[0][1]).not.toHaveProperty("query")
  })

  test("keeps the captured shop when the user switches shop while the workflow runs", async () => {
    const { t, client, userId, otherShop, missing, other } = await fixture()
    catalogue()
    const runId = await client.mutation(api.productSync.start, {})
    await t.run(ctx => ctx.db.patch(userId, { activeShopId: otherShop }))
    await t.finishAllScheduledFunctions(vi.runAllTimers, 150)
    expect(await client.query(api.productSync.status, { runId })).toBeNull()
    expect((await t.query(internal.productSync.getRun, { runId }))?.status).toBe("completed")
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeTypeOf("number")
    expect((await t.run(ctx => ctx.db.get(other)))?.shopifyDeletedAt).toBeUndefined()
  })

  test("does not reconcile or archive after an interrupted scan, even after automatic retries", async () => {
    const { t, client, missing } = await fixture()
    graphql.mockImplementation(async (query, variables) => {
      expect(query).toBe(PRODUCTS_QUERY)
      if (variables.after) throw new Error("Shopify indisponible")
      return { products: { nodes: [remoteProduct()], pageInfo: { hasNextPage: true, endCursor: "next" } } }
    })
    const runId = await client.mutation(api.productSync.start, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers, 150)
    expect(await client.query(api.productSync.status, { runId })).toMatchObject({ status: "failed", synced: 1, removed: 0 })
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeUndefined()
  })

  test("an incomplete presence response never treats omitted nodes as deleted products", async () => {
    const { t, client, missing, filtered } = await fixture()
    catalogue()
    const read = graphql.getMockImplementation()!
    graphql.mockImplementation(async (...args) => args[0] === PRODUCT_PRESENCE_QUERY ? { nodes: [null] } : read(...args))
    const runId = await client.mutation(api.productSync.start, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers, 150)
    expect(await client.query(api.productSync.status, { runId })).toMatchObject({ status: "failed", removed: 0 })
    for (const id of [missing, filtered]) expect((await t.run(ctx => ctx.db.get(id)))?.shopifyDeletedAt).toBeUndefined()
  })

  test("a partial explicit sync never archives products it did not read", async () => {
    const { t, client, missing } = await fixture()
    graphql.mockResolvedValue({ products: { nodes: [remoteProduct()], pageInfo: { hasNextPage: true, endCursor: "next" } } })
    expect(await client.action(api.shopify.syncProducts, { limit: 1 })).toEqual({ synced: 1 })
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeUndefined()
    expect(graphql).toHaveBeenCalledTimes(1)
  })

  test("authenticates starts and isolates status reads from another owner", async () => {
    const { t, client } = await fixture()
    await expect(t.mutation(api.productSync.start, {})).rejects.toThrow("Authentication required")
    const runId = await client.mutation(api.productSync.start, {})
    const otherUser = await t.run(async ctx => {
      const user = await ctx.db.insert("users", { approvalStatus: "approved" })
      const shop = await ctx.db.insert("shops", { domain: "stranger.myshopify.com", createdByUserId: user, createdAt: 1, updatedAt: 1 })
      await ctx.db.patch(user, { activeShopId: shop })
      return user
    })
    expect(await t.withIdentity({ subject: otherUser }).query(api.productSync.status, { runId })).toBeNull()
    catalogue()
    await t.finishAllScheduledFunctions(vi.runAllTimers, 150)
  })
})

describe("presence verification fences", () => {
  test("rejects malformed, reordered and wrong-type responses", () => {
    expect(missingProductIds({ nodes: [null, { __typename: "Product", id: "b" }] }, ["a", "b"])).toEqual(new Set(["a"]))
    for (const response of [{}, { nodes: [null] }, { nodes: [undefined, null] }, { nodes: [{ __typename: "Product", id: "b" }, null] },
      { nodes: [{ __typename: "ProductVariant", id: "a" }, null] }])
      expect(() => missingProductIds(response, ["a", "b"])).toThrow()
  })

  test("preserves a newer sync or manual update instead of applying a stale absence result", async () => {
    const { t, shopId, missing } = await fixture()
    const expected = await snapshot(t, missing)
    await t.run(ctx => ctx.db.patch(missing, { updatedAt: 2, lastSyncedAt: 2 }))
    expect(await t.mutation(internal.productSyncReconciliation.applyVerifiedPresence, { shopId, checks: [{ ...expected, missing: true }] })).toBe(0)
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeUndefined()
  })

  test("rejects cross-shop archival and keeps draft cleanup fenced after product restoration", async () => {
    const { t, shopId, other, missing, draft } = await fixture()
    await expect(t.mutation(internal.productSyncReconciliation.applyVerifiedPresence, { shopId, checks: [{ ...await snapshot(t, other), missing: true }] }))
      .rejects.toThrow("boutique attendue")
    await t.mutation(internal.productSyncReconciliation.applyVerifiedPresence, { shopId, checks: [{ ...await snapshot(t, missing), missing: true }] })
    await t.run(ctx => ctx.db.patch(missing, { shopifyDeletedAt: undefined, updatedAt: Date.now() + 1 }))
    await t.finishAllScheduledFunctions(vi.runAllTimers, 50)
    expect((await t.run(ctx => ctx.db.get(draft)))?.included).toBe(true)
  })

  test("single-product sync archives only an explicit null, never an incomplete API response", async () => {
    const { t, client, missing } = await fixture()
    graphql.mockResolvedValueOnce({})
    await expect(client.action(api.shopify.syncProduct, { productId: missing })).rejects.toThrow("incomplète")
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeUndefined()
    graphql.mockImplementation(async query => { expect(query).toBe(PRODUCT_QUERY); return { product: null } })
    await expect(client.action(api.shopify.syncProduct, { productId: missing })).rejects.toThrow("history is preserved")
    await t.finishAllScheduledFunctions(vi.runAllTimers, 50)
    expect((await t.run(ctx => ctx.db.get(missing)))?.shopifyDeletedAt).toBeTypeOf("number")
  })
})
