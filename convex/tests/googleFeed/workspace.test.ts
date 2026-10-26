/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"
import { api, internal } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob("../../**/*.ts")

async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { approvalStatus: "approved" })
    const otherUser = await ctx.db.insert("users", { approvalStatus: "approved" })
    const shop = await ctx.db.insert("shops", {
      domain: "workspace.myshopify.com",
      createdByUserId: user,
      createdAt: 1,
      updatedAt: 1,
    })
    const otherShop = await ctx.db.insert("shops", {
      domain: "other.myshopify.com",
      createdByUserId: otherUser,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.patch(user, { activeShopId: shop })
    await ctx.db.patch(otherUser, { activeShopId: otherShop })
    const product = await ctx.db.insert("products", {
      shopId: shop,
      shopifyProductId: "gid://shopify/Product/1",
      title: "Mocassin École",
      handle: "mocassin-ecole",
      tags: [],
      collections: [{ title: "Homme" }, { title: "Femme" }],
      options: [],
      variants: [],
      metafields: [],
      currentShopifyImages: [],
      generationStatus: "not_started",
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("googleFeedConfigs", {
      shopId: shop,
      status: "ready",
      googleAppStatus: "unverified",
      checkedAt: 1,
      updatedAt: 1,
      attributes: ["gender", "age_group"].map((attribute) => ({
        attribute: attribute as "gender" | "age_group",
        status: "ready" as const,
        message: "ready",
        coordinate: {
          definitionId: attribute,
          namespace: "google",
          key: attribute,
          type: "single_line_text_field",
          ownerType: "PRODUCTVARIANT" as const,
        },
      })),
    })
    const rules = []
    for (const [name, value] of [
      ["Homme", "male"],
      ["Femme", "female"],
    ])
      rules.push(
        await ctx.db.insert("googleFeedRules", {
          shopId: shop,
          createdByUserId: user,
          name,
          active: true,
          priority: 10,
          target: "product",
          attribute: "gender",
          conditionMode: "or",
          conditions: [{ field: "collections", operator: "contains", value: name }],
          value,
          overwritePolicy: "only_if_empty",
          createdAt: 1,
          updatedAt: 1,
        }),
      )
    const drafts = []
    for (let index = 0; index < 5; index++) {
      const variantId = await ctx.db.insert("productVariants", {
        shopId: shop,
        productId: product,
        shopifyVariantId: `gid://shopify/ProductVariant/${index}`,
        title: `Noir / ${38 + index}`,
        sku: String(index),
        selectedOptions: [],
        lastSyncedAt: 1,
        updatedAt: 1,
      })
      drafts.push(
        await ctx.db.insert("googleFeedDrafts", {
          shopId: shop,
          createdByUserId: user,
          productId: product,
          variantId,
          ownerId: `gid://shopify/ProductVariant/${index}`,
          ownerType: "PRODUCTVARIANT",
          attribute: "gender",
          currentValue: null,
          proposedValue: "male",
          sourceKind: index === 2 ? "manual" : "rule",
          sourceRuleId: index === 2 ? null : rules[0],
          matchingRuleIds: rules,
          sourceLabel: "Règle",
          status: index < 2 ? "conflict" : index === 4 ? "failed" : "draft",
          included: true,
          error: index === 4 ? "Owner does not exist." : null,
          createdAt: 1,
          updatedAt: 1,
        }),
      )
    }
    return { user, otherUser, shop, otherShop, product, drafts }
  })
  return {
    t,
    ...ids,
    owner: t.withIdentity({ subject: ids.user }),
    other: t.withIdentity({ subject: ids.otherUser }),
  }
}

describe("Google feed product workspace", () => {
  test("groups conflicts and invalid fields of the same product together", async () => {
    const { t, owner, product, drafts } = await setup()
    await t.run(async (ctx) => {
      const row = (await ctx.db.get(drafts[0]!))!
      await ctx.db.insert("googleFeedDrafts", {
        shopId: row.shopId,
        createdByUserId: row.createdByUserId,
        productId: product,
        variantId: row.variantId,
        ownerId: row.ownerId,
        ownerType: row.ownerType,
        attribute: "age_group",
        currentValue: null,
        proposedValue: "invalid",
        sourceKind: "rule",
        sourceLabel: "Âge",
        status: "invalid",
        included: true,
        error: "Valeur inconnue",
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const list = await owner.query(api.googleFeedWorkspace.listProducts, { view: "review" })
    expect(list.products).toHaveLength(1)
    expect(list.products[0]).toMatchObject({
      attributes: ["gender", "age_group"],
      variantCount: 2,
      fieldCount: 3,
    })
  })
  test("uses distinct products and keeps Shopify failures out of ready", async () => {
    const { owner, product } = await setup()
    for (const view of ["review", "ready", "errors"] as const) {
      const result = await owner.query(api.googleFeedWorkspace.listProducts, { view })
      expect(result.products).toHaveLength(1)
      expect(result.products[0]?.id).toBe(product)
      expect(await owner.query(api.googleFeedWorkspace.countProducts, { view })).toEqual({
        count: 1,
        hasMore: false,
      })
    }
    const ready = await owner.query(api.googleFeedWorkspace.productDetails, {
      productId: product,
      view: "ready",
    })
    expect(ready.rows).toHaveLength(2)
    expect(ready.rows.every((row) => row.status === "draft")).toBe(true)
    const review = await owner.query(api.googleFeedWorkspace.productDetails, {
      productId: product,
      view: "review",
    })
    expect(review.conflicts[0]?.rules.map((rule) => rule.value)).toEqual(["male", "female"])
    expect(review.manualRows).toHaveLength(1)
  })

  test("searches product names without reading the whole catalogue's variants", async () => {
    const { owner } = await setup()
    expect(
      (await owner.query(api.googleFeedWorkspace.listProducts, { view: "review", search: "ECOLE" }))
        .products,
    ).toHaveLength(1)
    expect(
      (
        await owner.query(api.googleFeedWorkspace.listProducts, {
          view: "review",
          search: "absent",
        })
      ).products,
    ).toEqual([])
  })

  test("preserves existing and concurrent manual choices and selected scope", async () => {
    const { t, owner, product, drafts } = await setup()
    await owner.mutation(api.googleFeed.updateDraftValue, { draftId: drafts[0]!, value: "female" })
    const before = await t.run((ctx) => ctx.db.get(drafts[0]!))
    const oldManual = await t.run((ctx) => ctx.db.get(drafts[2]!))
    const result = await owner.mutation(api.googleFeedWorkspace.choose, {
      productId: product,
      attribute: "gender",
      value: "unisex",
      rows: [drafts[0]!, drafts[1]!, drafts[2]!].map((id) => ({ id, updatedAt: 1 })),
    })
    expect(result).toEqual({ updated: 1, preserved: 2 })
    expect(await t.run((ctx) => ctx.db.get(drafts[0]!))).toEqual(before)
    expect(await t.run((ctx) => ctx.db.get(drafts[2]!))).toEqual(oldManual)
    expect(await t.run((ctx) => ctx.db.get(drafts[1]!))).toMatchObject({
      sourceKind: "manual",
      proposedValue: "unisex",
      status: "draft",
    })
    expect(await t.run((ctx) => ctx.db.get(drafts[4]!))).toMatchObject({ status: "failed" })
    expect(await t.run((ctx) => ctx.db.query("googleFeedRuns").take(1))).toEqual([])
  })

  test("rolls back stale decisions, skips excluded and publishing rows", async () => {
    const { t, owner, product, drafts } = await setup()
    await t.run((ctx) => ctx.db.patch(drafts[1]!, { updatedAt: 2 }))
    await expect(
      owner.mutation(api.googleFeedWorkspace.choose, {
        productId: product,
        attribute: "gender",
        value: "female",
        rows: drafts.slice(0, 2).map((id) => ({ id, updatedAt: 1 })),
      }),
    ).rejects.toThrow("ont changé")
    expect((await t.run((ctx) => ctx.db.get(drafts[0]!)))?.status).toBe("conflict")
    await t.run(async (ctx) => {
      await ctx.db.patch(drafts[0]!, { included: false })
      await ctx.db.patch(drafts[1]!, { status: "publishing" })
    })
    expect(
      await owner.mutation(api.googleFeedWorkspace.choose, {
        productId: product,
        attribute: "gender",
        value: "female",
        rows: drafts.slice(0, 2).map((id) => ({ id, updatedAt: 1 })),
      }),
    ).toEqual({ updated: 0, preserved: 2 })
    await expect(
      owner.mutation(api.googleFeed.updateDraftValue, { draftId: drafts[1]!, value: "female" }),
    ).rejects.toThrow("en cours de publication")
  })

  test("rejects anonymous and foreign-shop reads and writes", async () => {
    const { t, owner, other, product, drafts, otherUser } = await setup()
    await expect(t.query(api.googleFeedWorkspace.listProducts, { view: "review" })).rejects.toThrow(
      "Authentication required",
    )
    await expect(
      other.query(api.googleFeedWorkspace.productDetails, { productId: product, view: "review" }),
    ).rejects.toThrow("introuvable")
    await expect(
      other.mutation(api.googleFeedWorkspace.choose, {
        productId: product,
        attribute: "gender",
        value: "female",
        rows: [{ id: drafts[0]!, updatedAt: 1 }],
      }),
    ).rejects.toThrow("introuvable")
    await expect(
      t.query(internal.googleFeed.productRetryRows, { userId: otherUser, productId: product }),
    ).rejects.toThrow("introuvable")
    expect(
      (await other.query(api.googleFeedWorkspace.listProducts, { view: "ready" })).products,
    ).toEqual([])
    expect(
      (await owner.query(api.googleFeedWorkspace.listProducts, { view: "review" })).products,
    ).toHaveLength(1)
  })

  test("only claims ready drafts and never automatically retries a new failure", async () => {
    const { t, user, drafts } = await setup()
    const runId = await t.mutation(internal.googleFeed.createRun, {
      userId: user,
      kind: "publication",
      source: "manual",
    })
    const batch = await t.mutation(internal.googleFeed.claimPublishBatch, { userId: user, runId })
    expect(batch.map((row) => row.draftId).sort()).toEqual(drafts.slice(2, 4).sort())
    await t.mutation(internal.googleFeed.completePublishBatch, {
      runId,
      results: batch.map((row) => ({
        draftId: row.draftId,
        runItemId: row.runItemId,
        status: "failed" as const,
        error: "Owner does not exist.",
      })),
    })
    expect(
      await t.mutation(internal.googleFeed.claimPublishBatch, { userId: user, runId }),
    ).toEqual([])
    expect((await t.run((ctx) => ctx.db.get(drafts[2]!)))?.sourceKind).toBe("manual")
  })

  test("takes a product-only retry snapshot and skips a later correction", async () => {
    const { t, owner, product, drafts, user } = await setup()
    const retry = await t.query(internal.googleFeed.productRetryRows, {
      userId: user,
      productId: product,
    })
    expect(retry.map((row) => row.id)).toEqual([drafts[4]])
    await owner.mutation(api.googleFeed.updateDraftValue, {
      draftId: drafts[4]!,
      value: "female",
      expectedUpdatedAt: 1,
    })
    const runId = await t.mutation(internal.googleFeed.createRun, {
      userId: user,
      kind: "publication",
      source: "retry",
    })
    expect(
      await t.mutation(internal.googleFeed.claimPublishBatch, {
        userId: user,
        runId,
        drafts: retry,
      }),
    ).toEqual([])
    expect(await t.run((ctx) => ctx.db.get(drafts[4]!))).toMatchObject({
      proposedValue: "female",
      sourceKind: "manual",
      status: "draft",
    })
  })

  test("paginates distinct products without duplicating variants", async () => {
    const { t, owner, product, drafts } = await setup()
    await t.run(async (ctx) => {
      const original = (await ctx.db.get(product))!
      const row = (await ctx.db.get(drafts[0]!))!
      const { _id: _productId, _creationTime: _productTime, ...data } = original
      const { _id: _draftId, _creationTime: _draftTime, ...draft } = row
      void [_productId, _productTime, _draftId, _draftTime]
      for (let index = 0; index < 13; index++) {
        const id = await ctx.db.insert("products", {
          ...data,
          title: `Produit ${index}`,
          shopifyProductId: `product-${index}`,
        })
        await ctx.db.insert("googleFeedDrafts", {
          ...draft,
          productId: id,
          variantId: null,
          ownerId: `owner-${index}`,
        })
      }
    })
    const first = await owner.query(api.googleFeedWorkspace.listProducts, { view: "review" })
    const second = await owner.query(api.googleFeedWorkspace.listProducts, {
      view: "review",
      after: first.after!,
    })
    expect(first.products).toHaveLength(10)
    expect(second.products).toHaveLength(4)
    expect(new Set([...first.products, ...second.products].map((item) => item.id)).size).toBe(14)
    expect(second.hasMore).toBe(false)
  })
})
