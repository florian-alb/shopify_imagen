/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

describe("published image retouch", () => {
  test("keeps an overwritten Shopify image linked and published", async () => {
    const t = convexTest(schema, modules);
    const { imageId, mediaId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "retouch.myshopify.com",
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
        generationStatus: "pushed",
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
      const mediaId = "gid://shopify/MediaImage/1";
      const imageId = await ctx.db.insert("generatedImages", {
        shopId,
        productId,
        jobId,
        imageType: "Hero",
        promptUsed: "Prompt",
        generatedImageUrl: "https://example.com/old.webp",
        storageUrl: "https://example.com/old.webp",
        status: "uploaded",
        reviewStatus: "approved",
        reviewedAt: 2,
        reviewedByUserId: userId,
        shopifyMediaId: mediaId,
        publishedShopifyProductId: "gid://shopify/Product/1",
        createdAt: 1,
        updatedAt: 1,
      });

      return { imageId, mediaId, userId };
    });

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(internal.jobs.insertRetouchedImage, {
        sourceImageId: imageId,
        storageUrl: "https://example.com/retouched.webp",
        saveMode: "overwrite",
      });
    const image = await t.run((ctx) => ctx.db.get(imageId));

    expect(result).toBe(imageId);
    expect(image).toMatchObject({
      storageUrl: "https://example.com/retouched.webp",
      generatedImageUrl: "https://example.com/retouched.webp",
      status: "uploaded",
      reviewStatus: "approved",
      reviewedAt: 2,
      reviewedByUserId: userId,
      shopifyMediaId: mediaId,
      publishedShopifyProductId: "gid://shopify/Product/1",
      retouchTool: "manual_brush",
      retouchedByUserId: userId,
    });
  });
});
