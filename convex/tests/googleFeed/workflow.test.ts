/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { afterEach, describe, expect, test, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import schema from "../../schema"

const modules = import.meta.glob("../../**/*.ts")

afterEach(() => {
  vi.unstubAllGlobals()
})

async function seedTwoShops() {
  const t = convexTest(schema, modules)
  const seeded = await t.run(async (ctx) => {
    const userA = await ctx.db.insert("users", { approvalStatus: "approved" })
    const userB = await ctx.db.insert("users", { approvalStatus: "approved" })
    const shopA = await ctx.db.insert("shops", {
      domain: "google-a.myshopify.com",
      clientId: "client-a",
      clientSecret: "secret-a",
      accessToken: "token-a",
      createdByUserId: userA,
      createdAt: 1,
      updatedAt: 1,
    })
    const shopB = await ctx.db.insert("shops", {
      domain: "google-b.myshopify.com",
      clientId: "client-b",
      clientSecret: "secret-b",
      accessToken: "token-b",
      createdByUserId: userB,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.patch(userA, { activeShopId: shopA })
    await ctx.db.patch(userB, { activeShopId: shopB })
    const productA = await ctx.db.insert("products", {
      shopId: shopA,
      shopifyProductId: "gid://shopify/Product/A",
      title: "Sandales A",
      handle: "sandales-a",
      vendor: "Atelier",
      productType: "Chaussures",
      tags: ["Enfants"],
      collections: [{ title: "Enfants" }],
      options: [],
      variants: [],
      metafields: [],
      currentShopifyImages: [],
      generationStatus: "not_started",
      createdAt: 1,
      updatedAt: 1,
    })
    const variantA = await ctx.db.insert("productVariants", {
      shopId: shopA,
      productId: productA,
      shopifyVariantId: "gid://shopify/ProductVariant/A1",
      title: "22",
      sku: "A-22",
      selectedOptions: [{ name: "Pointure", value: "22" }],
      gender: null,
      ageGroup: null,
      lastSyncedAt: 1,
      updatedAt: 1,
    })
    const attributes = [
      {
        attribute: "google_product_category" as const,
        status: "ready" as const,
        coordinate: {
          definitionId: "category",
          namespace: "google",
          key: "google_product_category",
          type: "single_line_text_field",
          ownerType: "PRODUCT" as const,
        },
        message: "ready",
      },
      {
        attribute: "gender" as const,
        status: "ready" as const,
        coordinate: {
          definitionId: "gender",
          namespace: "google",
          key: "gender",
          type: "single_line_text_field",
          ownerType: "PRODUCTVARIANT" as const,
        },
        message: "ready",
      },
      {
        attribute: "age_group" as const,
        status: "ready" as const,
        coordinate: {
          definitionId: "age",
          namespace: "google",
          key: "age_group",
          type: "single_line_text_field",
          ownerType: "PRODUCTVARIANT" as const,
        },
        message: "ready",
      },
    ]
    await ctx.db.insert("googleFeedConfigs", {
      shopId: shopA,
      status: "ready",
      googleAppStatus: "unverified",
      attributes,
      checkedAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert("googleFeedConfigs", {
      shopId: shopB,
      status: "ready",
      googleAppStatus: "unverified",
      attributes,
      checkedAt: 1,
      updatedAt: 1,
    })
    return { userA, userB, shopA, shopB, productA, variantA }
  })
  return { t, ...seeded }
}

describe("Google feed multi-shop workflow", () => {
  test("isolates drafts, rules and products between shops", async () => {
    const { t, userA, userB, productA, variantA } = await seedTwoShops()
    await t.withIdentity({ subject: userA }).mutation(api.googleFeed.setProductDraft, {
      productId: productA,
      attribute: "google_product_category",
      value: "123",
    })
    await t.withIdentity({ subject: userA }).mutation(api.googleFeed.setVariantDraft, {
      variantId: variantA,
      value: "toddler",
    })

    const previewA = await t
      .withIdentity({ subject: userA })
      .query(api.googleFeed.preview, {})
    const previewB = await t
      .withIdentity({ subject: userB })
      .query(api.googleFeed.preview, {})
    expect(previewA.page).toHaveLength(2)
    expect(previewB.page).toHaveLength(0)
    await expect(
      t.withIdentity({ subject: userB }).mutation(api.googleFeed.setVariantDraft, {
        variantId: variantA,
        value: "adult",
      }),
    ).rejects.toThrow("boutique active")
  })

  test("moves a draft through claim, verification result and history", async () => {
    const { t, userA, productA } = await seedTwoShops()
    await t.withIdentity({ subject: userA }).mutation(api.googleFeed.setProductDraft, {
      productId: productA,
      attribute: "google_product_category",
      value: "123",
    })
    const runId = await t.mutation(internal.googleFeed.createRun, {
      userId: userA,
      kind: "publication",
      source: "manual",
    })
    const claimed = await t.mutation(internal.googleFeed.claimPublishBatch, {
      userId: userA,
      runId,
      retryRunId: null,
    })
    expect(claimed).toHaveLength(1)
    await t.mutation(internal.googleFeed.completePublishBatch, {
      runId,
      results: [
        {
          draftId: claimed[0]!.draftId,
          runItemId: claimed[0]!.runItemId,
          status: "confirmed",
          value: "123",
          digest: "confirmed-digest",
        },
      ],
    })
    await t.mutation(internal.googleFeed.finishRun, { runId })

    const [preview, history, product] = await Promise.all([
      t.withIdentity({ subject: userA }).query(api.googleFeed.preview, {}),
      t.withIdentity({ subject: userA }).query(api.googleFeed.history, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      t.run((ctx) => ctx.db.get(productA)),
    ])
    expect(preview.readyCount).toBe(0)
    expect(history.page[0]).toMatchObject({
      status: "completed",
      succeededItems: 1,
    })
    expect(product).toMatchObject({
      googleProductCategory: "123",
      googleProductCategoryDigest: "confirmed-digest",
    })
  })

  test("saving and evaluating a rule never calls Shopify", async () => {
    const { t, userA } = await seedTwoShops()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await t.withIdentity({ subject: userA }).mutation(api.googleFeed.saveRule, {
      rule: {
        name: "Pointures enfants",
        active: true,
        priority: 1,
        target: "variant",
        attribute: "age_group",
        conditionMode: "and",
        conditions: [
          { field: "option_value", operator: "between", min: 20, max: 27 },
        ],
        value: "toddler",
        overwritePolicy: "only_if_empty",
      },
    })
    const result = await t
      .withIdentity({ subject: userA })
      .action(api.googleFeedActions.evaluateRules, {})
    expect(result.proposed).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
