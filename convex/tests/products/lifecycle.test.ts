/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { isProductActive } from "../../products/lifecycle";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

function product(shopId: Id<"shops">, title: string): Omit<Doc<"products">, "_id" | "_creationTime"> {
  return {
    shopId, shopifyProductId: `gid://shopify/Product/${title}`, title, handle: title,
    productType: title, shopifyStatus: "ACTIVE", tags: [], collections: [], options: [], variants: [],
    metafields: [], currentShopifyImages: [], generationStatus: "ready", createdAt: 1, updatedAt: 1,
  };
}

async function fixture() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "lifecycle.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    const otherShopId = await ctx.db.insert("shops", {
      domain: "other-lifecycle.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const activeId = await ctx.db.insert("products", product(shopId, "Actif"));
    const archivedId = await ctx.db.insert("products", {
      ...product(shopId, "Supprimé"), shopifyDeletedAt: 42, shopifyPresenceCheckedAt: 42,
      generatedImageCount: 1, vibe: "Instruction manuelle conservée",
    });
    const otherId = await ctx.db.insert("products", product(otherShopId, "Autre boutique"));
    const jobId = await ctx.db.insert("generationJobs", {
      shopId, status: "completed", mode: "single", executionMode: "realtime", imageProvider: "openai",
      productIds: [archivedId], selectedImageTypes: ["hero"], forceRegenerate: false,
      totalTasks: 1, completedTasks: 1, failedTasks: 0, generationCost: 0.25,
      createdAt: 1, updatedAt: 1,
    });
    const imageId = await ctx.db.insert("generatedImages", {
      shopId, jobId, productId: archivedId, imageType: "hero", promptUsed: "Prompt historique",
      status: "generated", reviewStatus: "approved", storageUrl: "https://example.com/history.png",
      createdAt: 1, updatedAt: 1,
    });
    return { userId, shopId, activeId, archivedId, otherId, jobId, imageId };
  });
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids };
}

describe("confirmed Shopify product archival", () => {
  test("legacy products remain active and a zero deletion timestamp still means archived", () => {
    expect(isProductActive({})).toBe(true);
    expect(isProductActive({ shopifyDeletedAt: null })).toBe(true);
    expect(isProductActive({ shopifyDeletedAt: 0 })).toBe(false);
    expect(isProductActive(null)).toBe(false);
  });

  test("hides archived products from catalogue, navigation, active lookup and facets", async () => {
    const { t, client, shopId, activeId, archivedId, otherId } = await fixture();
    expect((await client.query(api.products.list, {})).page.map((row) => row._id)).toEqual([activeId]);
    expect((await client.query(api.products.list, { search: "Supprimé" })).page).toEqual([]);
    expect(await client.query(api.products.navigation, {})).toMatchObject({ total: 1 });
    expect(await client.query(api.products.get, { productId: archivedId })).toBeNull();
    expect((await client.query(api.products.byIds, { productIds: [activeId, archivedId, otherId] })).map((row) => row._id))
      .toEqual([activeId]);
    expect(await t.query(internal.products.facetPage, {
      shopId, paginationOpts: { cursor: null, numItems: 100 },
    })).toMatchObject({ facets: { productTypes: ["Actif"] }, isDone: true });
  });

  test("retains historical job, image, product details and spend without exposing other shops", async () => {
    const { t, client, archivedId, otherId, jobId, imageId } = await fixture();
    const details = await client.query(api.products.getWithImages, { productId: archivedId });
    expect(details?.product).toMatchObject({ _id: archivedId, shopifyDeletedAt: 42, vibe: "Instruction manuelle conservée" });
    expect(details?.images.map((image) => image._id)).toEqual([imageId]);
    const historicalJob = await client.query(api.jobs.get, { jobId });
    expect(historicalJob?.products).toMatchObject([{ _id: archivedId, shopifyDeletedAt: 42 }]);
    expect(historicalJob?.images).toMatchObject([{ _id: imageId, storageUrl: "https://example.com/history.png" }]);
    expect(historicalJob?.job.generationCost).toBe(0.25);
    expect(await client.query(api.products.getWithImages, { productId: otherId })).toBeNull();
    expect(await t.query(internal.products.internalGet, { productId: archivedId })).toBeNull();
    expect(await t.query(internal.products.internalGet, { productId: archivedId, includeArchived: true }))
      .toMatchObject({ _id: archivedId, shopifyDeletedAt: 42 });
    expect(await t.run((ctx) => ctx.db.get(imageId))).not.toBeNull();
  });

  test("a later successful synchronization restores the same identity and keeps historical data", async () => {
    const { t, client, shopId, archivedId, jobId } = await fixture();
    const restoredId = await t.mutation(internal.products.upsertSynced, {
      shopId, shopifyProductId: "gid://shopify/Product/Supprimé", title: "Revenu dans Shopify", handle: "revenu",
      tags: [], collections: [], options: [], variants: [], metafields: [], currentShopifyImages: [],
    });
    expect(restoredId).toBe(archivedId);
    const restored = await client.query(api.products.get, { productId: archivedId });
    expect(restored?.shopifyDeletedAt).toBeUndefined();
    expect(restored?.shopifyPresenceCheckedAt).toBeGreaterThan(42);
    expect(restored?.vibe).toBe("Instruction manuelle conservée");
    expect(restored?.generatedImageCount).toBe(1);
    expect((await client.query(api.jobs.get, { jobId }))?.products).toMatchObject([{ _id: archivedId }]);
  });

  test("refuses new generation, regeneration and visual configuration for archived products", async () => {
    const { client, archivedId, imageId } = await fixture();
    await expect(client.mutation(api.jobs.create, {
      productIds: [archivedId], selectedImageTypes: ["hero"], forceRegenerate: false,
    })).rejects.toThrow("n’existe plus dans Shopify");
    expect(await client.query(api.jobs.preview, { productIds: [archivedId], selectedImageTypes: ["hero"] }))
      .toMatchObject({ totalImages: 0, error: expect.stringContaining("n’existe plus dans Shopify") });
    await expect(client.mutation(api.jobs.regenerateImage, { imageId })).rejects.toThrow("n’existe plus dans Shopify");
    expect(await client.query(api.visualGroups.getForProduct, { productId: archivedId })).toBeNull();
    await expect(client.mutation(api.visualGroups.configure, { productId: archivedId, optionNames: [] }))
      .rejects.toThrow("n’existe plus dans Shopify");
  });

  test("refuses image publication and new bulk operations while keeping previous assets", async () => {
    const { t, client, userId, archivedId, imageId } = await fixture();
    await expect(t.mutation(internal.shopifyPublications.claim, {
      productId: archivedId, fingerprint: "archived-selection", token: "token",
    })).rejects.toThrow("n’existe plus dans Shopify");
    await expect(t.mutation(internal.bulkTransforms.createJob, {
      userId, productIds: [archivedId], operation: "flip_horizontal",
    })).rejects.toThrow("n’existe plus dans Shopify");
    await expect(t.mutation(internal.bulkReorders.createJob, {
      userId, productIds: [archivedId], firstPosition: 1, secondPosition: 2,
    })).rejects.toThrow("n’existe plus dans Shopify");
    expect(await client.query(api.bulkTransforms.selectionOptions, { productIds: [archivedId] }))
      .toMatchObject({ unavailableProductCount: 1, positions: [] });
    expect(await t.run((ctx) => ctx.db.get(imageId))).toMatchObject({ status: "generated" });
    expect(await t.run((ctx) => ctx.db.query("productPublicationAttempts").withIndex("by_productId", (q) => q.eq("productId", archivedId)).first()))
      .toBeNull();
  });
});
