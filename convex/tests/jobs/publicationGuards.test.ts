/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

async function seedOwnedImage(status: "generated" | "uploaded") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "publication-guards.myshopify.com",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productId = await ctx.db.insert("products", {
      shopId,
      shopifyProductId: "gid://shopify/Product/1",
      title: "Produit",
      handle: "produit",
      tags: [],
      collections: [],
      options: [],
      variants: [],
      metafields: [],
      currentShopifyImages: [],
      generationStatus: "ready",
      createdAt: 1,
      updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      shopId,
      status: "completed",
      mode: "single",
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      forceRegenerate: false,
      totalTasks: 1,
      completedTasks: 1,
      failedTasks: 0,
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    const runId = await ctx.db.insert("imagePublishRuns", {
      jobId,
      shopId,
      shopDomain: "publication-guards.myshopify.com",
      includeLegacy: false,
      createdByUserId: userId,
      status: "running",
      replaceExisting: false,
      totalProducts: 1,
      processedProducts: 0,
      failedProducts: 0,
      totalImages: 1,
      pushedImages: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageId = await ctx.db.insert("generatedImages", {
      shopId,
      productId,
      jobId,
      imageType: "Hero",
      promptUsed: "Prompt",
      storageUrl: "https://example.com/source.webp",
      generatedImageUrl: "https://example.com/source.webp",
      status,
      reviewStatus: "approved",
      ...(status === "uploaded" ? { shopifyMediaId: "gid://shopify/MediaImage/1" } : {}),
      pushRunId: runId,
      createdAt: 1,
      updatedAt: 1,
    });
    return { userId, imageId, runId };
  });
  return { t, ...ids };
}

describe("images owned by a background publication", () => {
  test.each(["generated", "uploaded"] as const)("blocks review, regeneration and retouch while an %s image belongs to a run", async (status) => {
    const { t, userId, imageId, runId } = await seedOwnedImage(status);
    const client = t.withIdentity({ subject: userId });

    await expect(client.mutation(api.jobs.reviewImages, {
      imageIds: [imageId], reviewStatus: "rejected",
    })).rejects.toThrow("en cours de publication Shopify");
    await expect(client.mutation(api.jobs.regenerateImage, { imageId }))
      .rejects.toThrow("en cours de publication Shopify");
    await expect(client.query(internal.jobs.retouchSourceForSave, { imageId }))
      .rejects.toThrow("en cours de publication Shopify");
    await expect(client.mutation(internal.jobs.insertRetouchedImage, {
      sourceImageId: imageId,
      storageUrl: "https://example.com/retouched.webp",
      saveMode: "overwrite",
    })).rejects.toThrow("en cours de publication Shopify");

    expect(await t.run((ctx) => ctx.db.get(imageId))).toMatchObject({
      pushRunId: runId,
      reviewStatus: "approved",
      storageUrl: "https://example.com/source.webp",
    });
  });

  test("allows review and retouch once publication ownership is released", async () => {
    const { t, userId, imageId } = await seedOwnedImage("generated");
    await t.run((ctx) => ctx.db.patch(imageId, {
      pushRunId: undefined,
      pushError: "Previous upload failed.",
    }));
    const client = t.withIdentity({ subject: userId });
    await expect(client.mutation(api.jobs.reviewImages, {
      imageIds: [imageId], reviewStatus: "rejected",
    })).resolves.toEqual({ updated: 1 });
    await expect(client.mutation(internal.jobs.insertRetouchedImage, {
      sourceImageId: imageId,
      storageUrl: "https://example.com/retouched.webp",
      saveMode: "overwrite",
    })).resolves.toBe(imageId);

    const image = await t.run((ctx) => ctx.db.get(imageId));
    expect(image).toMatchObject({ status: "generated", reviewStatus: "pending" });
    expect(image?.pushError).toBeUndefined();
  });
});
