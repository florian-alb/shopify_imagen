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
      domain: "conflicts.myshopify.com",
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
    const productData = {
      shopId: shop,
      title: "Mocassin Homme Noir Cuir Et Daim",
      handle: "mocassin",
      tags: [],
      collections: [{ title: "Mocassin Homme" }, { title: "Mocassin Femme" }],
      options: [],
      variants: [],
      metafields: [],
      currentShopifyImages: [],
      generationStatus: "not_started" as const,
      createdAt: 1,
      updatedAt: 1,
    }
    const product = await ctx.db.insert("products", {
      ...productData,
      shopifyProductId: "gid://shopify/Product/1",
    })
    const otherProduct = await ctx.db.insert("products", {
      ...productData,
      shopifyProductId: "gid://shopify/Product/2",
      title: "Autre produit",
    })
    const variantIds = []
    for (const size of [38, 39, 40, 41])
      variantIds.push(
        await ctx.db.insert("productVariants", {
          shopId: shop,
          productId: product,
          shopifyVariantId: `gid://shopify/ProductVariant/${size}`,
          title: `Noir / ${size}`,
          sku: `N-${size}`,
          selectedOptions: [{ name: "Taille", value: String(size) }],
          gender: null,
          lastSyncedAt: 1,
          updatedAt: 1,
        }),
      )
    const ruleBase = {
      shopId: shop,
      createdByUserId: user,
      active: true,
      target: "product" as const,
      attribute: "gender" as const,
      conditionMode: "or" as const,
      overwritePolicy: "only_if_empty" as const,
      createdAt: 1,
      updatedAt: 1,
    }
    const maleRule = await ctx.db.insert("googleFeedRules", {
      ...ruleBase,
      name: "Genre Homme",
      priority: 10,
      value: "male",
      conditions: [{ field: "product_title", operator: "contains", value: "Homme" }],
    })
    const femaleRule = await ctx.db.insert("googleFeedRules", {
      ...ruleBase,
      name: "Genre Femme",
      priority: 20,
      value: "female",
      conditions: [{ field: "collections", operator: "contains", value: "Femme" }],
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
    const base = {
      shopId: shop,
      createdByUserId: user,
      productId: product,
      ownerType: "PRODUCTVARIANT" as const,
      attribute: "gender" as const,
      currentValue: null,
      proposedValue: "male",
      sourceKind: "rule" as const,
      sourceRuleId: maleRule,
      matchingRuleIds: [maleRule, femaleRule],
      sourceLabel: "Genre Homme",
      status: "conflict" as const,
      included: true,
      createdAt: 1,
      updatedAt: 1,
    }
    const conflicts = []
    for (const variantId of variantIds.slice(0, 2))
      conflicts.push(
        await ctx.db.insert("googleFeedDrafts", { ...base, variantId, ownerId: String(variantId) }),
      )
    const manual = await ctx.db.insert("googleFeedDrafts", {
      ...base,
      variantId: variantIds[2],
      ownerId: String(variantIds[2]),
      sourceKind: "manual",
      sourceRuleId: null,
      matchingRuleIds: undefined,
      sourceLabel: "Correction manuelle",
      proposedValue: "female",
      status: "draft",
    })
    const excluded = await ctx.db.insert("googleFeedDrafts", {
      ...base,
      variantId: variantIds[3],
      ownerId: String(variantIds[3]),
      included: false,
    })
    const age = await ctx.db.insert("googleFeedDrafts", {
      ...base,
      variantId: variantIds[0],
      ownerId: String(variantIds[0]),
      attribute: "age_group",
      proposedValue: "kids",
      sourceKind: "manual",
      status: "draft",
    })
    return {
      user,
      otherUser,
      shop,
      product,
      otherProduct,
      variantIds,
      maleRule,
      femaleRule,
      conflicts,
      manual,
      excluded,
      age,
    }
  })
  return {
    t,
    ...ids,
    owner: t.withIdentity({ subject: ids.user }),
    other: t.withIdentity({ subject: ids.otherUser }),
  }
}

describe("Product conflict review", () => {
  test("groups the product, explains both actual triggers and excludes manual/excluded rows", async () => {
    const { owner, product } = await setup()
    const list = await owner.query(api.googleFeedConflicts.listProducts, {})
    expect(list.products).toHaveLength(1)
    expect(list.products[0]).toMatchObject({ id: product, conflictCount: 2, manualCount: 1 })
    const details = await owner.query(api.googleFeedConflicts.productDetails, {
      productId: product,
    })
    expect(details.attributes).toHaveLength(1)
    const gender = details.attributes[0]!
    expect(gender.drafts).toHaveLength(2)
    expect(gender.rules.map((rule) => rule.value)).toEqual(["male", "female"])
    expect(gender.rules[0]!.evidence[0]).toMatchObject({
      matched: true,
      actualValues: ["Mocassin Homme Noir Cuir Et Daim"],
    })
    expect(gender.rules[1]!.evidence[0]).toMatchObject({
      matched: true,
      actualValues: ["Mocassin Femme"],
    })
  })

  test("resolves selected conflicts only, preserves manual/age/excluded values and never publishes", async () => {
    const { t, owner, product, conflicts, manual, excluded, age } = await setup()
    const before = await t.run(async (ctx) =>
      Promise.all([manual, excluded, age].map((id) => ctx.db.get(id))),
    )
    const result = await owner.mutation(api.googleFeedConflicts.resolve, {
      productId: product,
      attribute: "gender",
      value: "unisex",
      drafts: [...conflicts, manual, excluded].map((id) => ({ id, updatedAt: 1 })),
    })
    expect(result).toEqual({ updated: 2, preserved: 2 })
    const after = await t.run(async (ctx) =>
      Promise.all([manual, excluded, age].map((id) => ctx.db.get(id))),
    )
    expect(after).toEqual(before)
    for (const id of conflicts)
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        sourceKind: "manual",
        sourceRuleId: null,
        proposedValue: "unisex",
        status: "draft",
      })
    const variants = await t.run((ctx) => ctx.db.query("productVariants").take(10))
    expect(variants.every((variant) => variant.gender === null)).toBe(true)
    expect(await t.run((ctx) => ctx.db.query("googleFeedRuns").take(1))).toEqual([])
    expect((await owner.query(api.googleFeedConflicts.listProducts, {})).products).toEqual([])
  })

  test("can resolve just one variant", async () => {
    const { owner, product, conflicts } = await setup()
    await owner.mutation(api.googleFeedConflicts.resolve, {
      productId: product,
      attribute: "gender",
      value: "male",
      drafts: [{ id: conflicts[0]!, updatedAt: 1 }],
    })
    expect(
      (
        await owner.query(api.googleFeedConflicts.productDetails, { productId: product })
      ).attributes[0]!.drafts.map((draft) => draft.id),
    ).toEqual([conflicts[1]])
  })

  test("rejects anonymous, foreign-shop and foreign-product access", async () => {
    const { t, owner, other, product, otherProduct, conflicts } = await setup()
    const args = {
      productId: product,
      attribute: "gender" as const,
      value: "male",
      drafts: [{ id: conflicts[0]!, updatedAt: 1 }],
    }
    await expect(t.query(api.googleFeedConflicts.listProducts, {})).rejects.toThrow(
      "Authentication required",
    )
    await expect(
      t.query(api.googleFeedConflicts.productDetails, { productId: product }),
    ).rejects.toThrow("Authentication required")
    await expect(t.mutation(api.googleFeedConflicts.resolve, args)).rejects.toThrow(
      "Authentication required",
    )
    expect((await other.query(api.googleFeedConflicts.listProducts, {})).products).toEqual([])
    await expect(
      other.query(api.googleFeedConflicts.productDetails, { productId: product }),
    ).rejects.toThrow("boutique active")
    await expect(other.mutation(api.googleFeedConflicts.resolve, args)).rejects.toThrow(
      "boutique active",
    )
    await expect(
      owner.mutation(api.googleFeedConflicts.resolve, { ...args, productId: otherProduct }),
    ).rejects.toThrow("n’appartient pas")
    await expect(
      owner.mutation(api.googleFeedConflicts.resolve, { ...args, value: "anything" }),
    ).rejects.toThrow("genre")
  })

  test("rejects stale selections atomically", async () => {
    const { t, owner, product, conflicts } = await setup()
    await t.run((ctx) => ctx.db.patch(conflicts[1]!, { updatedAt: 2, proposedValue: "female" }))
    await expect(
      owner.mutation(api.googleFeedConflicts.resolve, {
        productId: product,
        attribute: "gender",
        value: "unisex",
        drafts: conflicts.map((id) => ({ id, updatedAt: 1 })),
      }),
    ).rejects.toThrow("ont changé")
    expect((await t.run((ctx) => ctx.db.get(conflicts[0]!)))?.status).toBe("conflict")
  })

  test("preserves a manual correction made after the review loaded", async () => {
    const { t, owner, product, conflicts } = await setup()
    await owner.mutation(api.googleFeed.updateDraftValue, {
      draftId: conflicts[0]!,
      value: "female",
    })
    const manual = await t.run((ctx) => ctx.db.get(conflicts[0]!))
    expect(
      await owner.mutation(api.googleFeedConflicts.resolve, {
        productId: product,
        attribute: "gender",
        value: "male",
        drafts: conflicts.map((id) => ({ id, updatedAt: 1 })),
      }),
    ).toEqual({ updated: 1, preserved: 1 })
    expect(await t.run((ctx) => ctx.db.get(conflicts[0]!))).toEqual(manual)
  })

  test("a late evaluation cannot overwrite a manual resolution", async () => {
    const { t, owner, user, product, shop, variantIds, conflicts, maleRule, femaleRule } =
      await setup()
    const runId = await t.mutation(internal.googleFeed.createRun, {
      userId: user,
      kind: "evaluation",
      source: "rules",
    })
    await owner.mutation(api.googleFeedConflicts.resolve, {
      productId: product,
      attribute: "gender",
      value: "female",
      drafts: [{ id: conflicts[0]!, updatedAt: 1 }],
    })
    const before = await t.run((ctx) => ctx.db.get(conflicts[0]!))
    const saved = await t.mutation(internal.googleFeed.saveEvaluationProposals, {
      userId: user,
      runId,
      proposals: [
        {
          localProductId: product,
          localVariantId: variantIds[0]!,
          ownerId: String(variantIds[0]),
          ownerType: "PRODUCTVARIANT",
          attribute: "gender",
          currentValue: null,
          currentDigest: null,
          proposedValue: "male",
          selectedRuleId: maleRule,
          selectedRuleName: "Genre Homme",
          matchingRuleIds: [maleRule, femaleRule],
          status: "conflict",
        },
      ],
    })
    expect(saved).toBe(0)
    expect(await t.run((ctx) => ctx.db.get(conflicts[0]!))).toEqual(before)
    expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({
      shopId: shop,
      skippedItems: 1,
      conflictItems: 0,
      succeededItems: 0,
    })
  })

  test("keeps old conflicts reachable beyond 5,000 unrelated newer drafts", async () => {
    const { t, owner, user, shop, product, otherProduct } = await setup()
    for (let start = 0; start < 5_005; start += 500)
      await t.run(async (ctx) => {
        for (let i = start; i < Math.min(start + 500, 5_005); i++)
          await ctx.db.insert("googleFeedDrafts", {
            shopId: shop,
            createdByUserId: user,
            productId: otherProduct,
            ownerId: `new-${i}`,
            ownerType: "PRODUCTVARIANT",
            attribute: "gender",
            currentValue: null,
            proposedValue: "male",
            sourceKind: "rule",
            sourceLabel: "Rule",
            status: "draft",
            included: true,
            createdAt: i + 10,
            updatedAt: i + 10,
          })
      })
    expect((await owner.query(api.googleFeed.preview, {})).countsAreCapped).toBe(true)
    expect(
      (await owner.query(api.googleFeedConflicts.listProducts, {})).products.map((p) => p.id),
    ).toEqual([product])
  })

  test("pages whole products without duplicates and searches beyond the first page", async () => {
    const { t, owner, shop, user, maleRule, femaleRule } = await setup()
    await t.run(async (ctx) => {
      for (let index = 1; index <= 11; index++) {
        const productId = await ctx.db.insert("products", {
          shopId: shop,
          shopifyProductId: `gid://shopify/Product/extra-${index}`,
          title: index === 11 ? "Spécial à retrouver" : `Produit ${index}`,
          handle: `extra-${index}`,
          tags: [],
          collections: [],
          options: [],
          variants: [],
          metafields: [],
          currentShopifyImages: [],
          generationStatus: "not_started",
          createdAt: 1,
          updatedAt: 1,
        })
        await ctx.db.insert("googleFeedDrafts", {
          shopId: shop,
          createdByUserId: user,
          productId,
          ownerId: `extra-${index}`,
          ownerType: "PRODUCT",
          attribute: "google_product_category",
          currentValue: null,
          proposedValue: "187",
          sourceKind: "rule",
          sourceLabel: "Test",
          matchingRuleIds: [maleRule, femaleRule],
          status: "conflict",
          included: true,
          createdAt: 1,
          updatedAt: 1,
        })
      }
    })
    const first = await owner.query(api.googleFeedConflicts.listProducts, {})
    expect(first.products).toHaveLength(10)
    expect(first.hasMore).toBe(true)
    const second = await owner.query(api.googleFeedConflicts.listProducts, { after: first.after! })
    expect(second.products).toHaveLength(2)
    expect(second.hasMore).toBe(false)
    expect(new Set([...first.products, ...second.products].map((product) => product.id)).size).toBe(
      12,
    )
    const search = await owner.query(api.googleFeedConflicts.listProducts, { search: "SPECIAL" })
    expect(search.products.map((product) => product.title)).toEqual(["Spécial à retrouver"])
  })

  test("opens deleted or changed rules honestly", async () => {
    const { t, owner, product, femaleRule, maleRule } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.delete(femaleRule)
      await ctx.db.patch(maleRule, {
        updatedAt: 3,
        conditions: [{ field: "product_title", operator: "contains", value: "absent" }],
      })
    })
    const details = await owner.query(api.googleFeedConflicts.productDetails, {
      productId: product,
    })
    expect(details.attributes[0]!.rules[0]).toMatchObject({
      changed: true,
      evidence: [{ matched: false }],
    })
    expect(details.attributes[0]!.rules[1]).toMatchObject({
      missing: true,
      value: null,
      evidence: [],
    })
  })
})
