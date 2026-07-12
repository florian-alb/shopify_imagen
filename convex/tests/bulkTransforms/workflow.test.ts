/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

describe("bulk transform workflow counters", () => {
  test("finishes a publish conflict exactly once", async () => {
    const t = convexTest(schema, modules);
    const { itemId, jobId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const productId = await ctx.db.insert("products", {
        shopifyProductId: "gid://shopify/Product/1",
        title: "Produit",
        handle: "produit",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "publishing",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 1,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const itemId = await ctx.db.insert("bulkTransformItems", {
        jobId,
        productId,
        referencedProductIds: [productId],
        operation: "flip_horizontal",
        sourceMediaId: "gid://shopify/MediaImage/1",
        sourceUrl: "https://cdn.shopify.com/source.jpg",
        sourcePosition: 0,
        status: "publishing",
        attempts: 2,
        publishAttempts: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { itemId, jobId };
    });

    const args = {
      itemId,
      error: "source changed",
      conflict: true,
    };
    await t.mutation(internal.bulkTransforms.markPublishFailed, args);
    await t.mutation(internal.bulkTransforms.markPublishFailed, args);

    const result = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      job: await ctx.db.get(jobId),
    }));
    expect(result.item?.status).toBe("conflict");
    expect(result.job).toMatchObject({
      status: "partial",
      conflictItems: 1,
      publishFailedItems: 0,
      publishedItems: 0,
    });
  });

  test("resets conflict assets and counters before a retry", async () => {
    const t = convexTest(schema, modules);
    const { itemId, jobId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const productId = await ctx.db.insert("products", {
        shopifyProductId: "gid://shopify/Product/2",
        title: "Produit 2",
        handle: "produit-2",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "transforming",
        retryPhase: "conflict",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 1,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 1,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const itemId = await ctx.db.insert("bulkTransformItems", {
        jobId,
        productId,
        referencedProductIds: [productId],
        operation: "flip_horizontal",
        sourceMediaId: "gid://shopify/MediaImage/2",
        sourceUrl: "https://cdn.shopify.com/source.jpg",
        sourcePosition: 0,
        sourceSha256: "source",
        transformedSha256: "mirror",
        sourceBackupUrl: "https://r2.example/source.jpg",
        outputUrl: "https://r2.example/mirror.webp",
        status: "conflict",
        attempts: 2,
        publishAttempts: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { itemId, jobId };
    });

    await t.mutation(internal.bulkTransforms.resetFailures, {
      jobId,
      phase: "conflict",
    });

    const result = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      job: await ctx.db.get(jobId),
    }));
    expect(result.item).toMatchObject({
      status: "queued",
      sourceSha256: null,
      transformedSha256: null,
      sourceBackupUrl: null,
      outputUrl: null,
    });
    expect(result.job).toMatchObject({
      conflictItems: 0,
      transformedItems: 0,
    });
    expect(result.job?.retryPhase).toBeUndefined();
  });

  test("ignores a late seed failure from an earlier product", async () => {
    const t = convexTest(schema, modules);
    const jobId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const productIds = await Promise.all(
        [1, 2].map((index) =>
          ctx.db.insert("products", {
            shopifyProductId: `gid://shopify/Product/${index}`,
            title: `Produit ${index}`,
            handle: `produit-${index}`,
            tags: [],
            collections: [],
            options: [],
            variants: [],
            metafields: [],
            currentShopifyImages: [],
            generationStatus: "not_started",
            createdAt: 1,
            updatedAt: 1,
          }),
        ),
      );
      return await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "queued",
        productIds,
        seededProductCount: 0,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 0,
        totalItems: 0,
        transformedItems: 0,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const failure = {
      jobId,
      productIndex: 0,
      error: "unavailable",
      retryable: false,
    };
    await t.mutation(internal.bulkTransforms.recordSeedFailure, failure);
    await t.mutation(internal.bulkTransforms.recordSeedFailure, failure);

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      failures: await ctx.db
        .query("bulkTransformSeedFailures")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .take(2),
    }));
    expect(result.job).toMatchObject({
      seededProductCount: 1,
      seedFailedProducts: 1,
      seedAttempts: 0,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      error: "unavailable",
      attempts: 1,
    });
  });

  test("fails closed for positional jobs created before safe media snapshots", async () => {
    const t = convexTest(schema, modules);
    const jobId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const productId = await ctx.db.insert("products", {
        shopifyProductId: "gid://shopify/Product/legacy-position-snapshot",
        title: "Produit snapshot legacy",
        handle: "produit-snapshot-legacy",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [
          {
            mediaId: "gid://shopify/MediaImage/legacy-position-snapshot",
            url: "https://cdn.shopify.com/legacy-position.jpg",
          },
        ],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "queued",
        productIds: [productId],
        selectedImagePositions: [1],
        seededProductCount: 0,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 0,
        totalItems: 1,
        transformedItems: 0,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await t.action(internal.bulkTransformsNode.seedNextProduct, { jobId });

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      failure: await ctx.db
        .query("bulkTransformSeedFailures")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .unique(),
    }));
    expect(result.job).toMatchObject({
      status: "failed",
      seededProductCount: 1,
      seedFailedProducts: 1,
    });
    expect(result.failure?.error).toContain("predates safe image snapshots");
  });

  test("does not revive an old job beside a newer active bulk", async () => {
    const t = convexTest(schema, modules);
    const { oldJobId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "example.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/lock",
        title: "Produit lock",
        handle: "produit-lock",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const base = {
        shopId,
        createdByUserId: userId,
        operation: "flip_horizontal" as const,
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 0,
        transformFailedItems: 1,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      };
      const oldJobId = await ctx.db.insert("bulkTransformJobs", {
        ...base,
        status: "partial",
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        status: "queued",
        transformFailedItems: 0,
      });
      return { oldJobId, userId };
    });

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.bulkTransforms.retryFailures, { jobId: oldJobId }),
    ).rejects.toThrow("Another bulk image operation is already active");
  });

  test("shows an older active bulk before a newer terminal result", async () => {
    const t = convexTest(schema, modules);
    const { activeJobId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "active-priority.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/active-priority",
        title: "Produit actif",
        handle: "produit-actif",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const base = {
        shopId,
        createdByUserId: userId,
        operation: "flip_horizontal" as const,
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 1,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
      };
      const activeJobId = await ctx.db.insert("bulkTransformJobs", {
        ...base,
        status: "publishing",
        updatedAt: 10,
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        status: "completed",
        publishedItems: 1,
        completedAt: 20,
        updatedAt: 20,
      });
      return { activeJobId, userId };
    });

    const latest = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.latestUndismissed, {});

    expect(latest?._id).toBe(activeJobId);
    expect(latest?.status).toBe("publishing");
  });

  test("builds position options and persists a normalized image selection", async () => {
    const t = convexTest(schema, modules);
    const { productIds, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "positions.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productIds = await Promise.all(
        [1, 2].map((index) =>
          ctx.db.insert("products", {
            shopId,
            shopifyProductId: `gid://shopify/Product/position-${index}`,
            title: `Produit position ${index}`,
            handle: `produit-position-${index}`,
            tags: [],
            collections: [],
            options: [],
            variants: [],
            metafields: [],
            currentShopifyImages: [
              {
                mediaId: `gid://shopify/MediaImage/first-${index}`,
                url: `https://cdn.shopify.com/first-${index}.jpg`,
              },
              {
                mediaId: "gid://shopify/MediaImage/shared-second",
                url: "https://cdn.shopify.com/shared-second.jpg",
              },
            ],
            generationStatus: "not_started",
            createdAt: 1,
            updatedAt: 1,
          }),
        ),
      );
      return { productIds, userId };
    });

    const options = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.selectionOptions, { productIds });
    expect(options.positions).toMatchObject([
      { position: 1, productCount: 2 },
      { position: 2, productCount: 2 },
    ]);
    expect(options.positions[0]?.previews).toHaveLength(2);
    expect(options.snapshotToken).toMatch(/^[0-9a-f]{16}$/);

    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds,
        operation: "flip_horizontal",
        imagePositions: [],
      }),
    ).rejects.toThrow("Select at least one Shopify image position");

    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds,
        operation: "flip_horizontal",
        imagePositions: [2],
      }),
    ).rejects.toThrow("Review the Shopify image positions");

    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds,
        operation: "flip_horizontal",
        imagePositions: [2],
        selectionSnapshotToken: "stale-selection",
      }),
    ).rejects.toThrow("images changed while the bulk dialog was open");

    const jobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds,
      operation: "flip_horizontal",
      imagePositions: [2, 2],
      selectionSnapshotToken: options.snapshotToken,
    });
    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job).toMatchObject({
      selectedImagePositions: [2],
      selectionProductHashes: expect.any(Array),
      totalItems: 1,
    });
  });

  test("updates shared published media caches in bounded batches", async () => {
    const t = convexTest(schema, modules);
    const { itemId, productIds } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const productIds = await Promise.all(
        Array.from({ length: 11 }, (_, index) =>
          ctx.db.insert("products", {
            shopifyProductId: `gid://shopify/Product/cache-${index}`,
            title: `Produit cache ${index}`,
            handle: `produit-cache-${index}`,
            tags: [],
            collections: [],
            options: [],
            variants: [],
            metafields: [],
            currentShopifyImages: [
              {
                mediaId: "gid://shopify/MediaImage/shared-cache",
                url: "https://cdn.shopify.com/old.jpg",
              },
            ],
            featuredImageUrl: "https://cdn.shopify.com/old.jpg",
            generationStatus: "not_started",
            createdAt: 1,
            updatedAt: 1,
          }),
        ),
      );
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "completed",
        productIds,
        seededProductCount: productIds.length,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 1,
        transformFailedItems: 0,
        publishedItems: 1,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      const itemId = await ctx.db.insert("bulkTransformItems", {
        jobId,
        productId: productIds[0],
        referencedProductIds: productIds,
        operation: "flip_horizontal",
        sourceMediaId: "gid://shopify/MediaImage/shared-cache",
        sourceUrl: "https://cdn.shopify.com/old.jpg",
        sourcePosition: 0,
        transformedSha256: "mirror-hash",
        publishedUrl: "https://cdn.shopify.com/new.jpg",
        status: "published",
        attempts: 1,
        publishAttempts: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { itemId, productIds };
    });

    const firstBatch = await t.mutation(
      internal.bulkTransforms.refreshPublishedProductCaches,
      { itemId, nextProductIndex: 0 },
    );
    expect(firstBatch).toEqual({
      updatedProducts: 10,
      done: false,
      nextProductIndex: 10,
    });
    const afterFirstBatch = await t.run(async (ctx) =>
      Promise.all(productIds.map((productId) => ctx.db.get(productId))),
    );
    expect(afterFirstBatch[0]).toMatchObject({
      featuredImageUrl: "https://cdn.shopify.com/new.jpg",
      currentShopifyImages: [
        {
          url: "https://cdn.shopify.com/new.jpg",
          displayUrl: "https://cdn.shopify.com/new.jpg?bulk_v=mirror-hash",
        },
      ],
    });
    expect(afterFirstBatch[10]).toMatchObject({
      featuredImageUrl: "https://cdn.shopify.com/old.jpg",
    });

    const finalBatch = await t.mutation(
      internal.bulkTransforms.refreshPublishedProductCaches,
      { itemId, nextProductIndex: 10 },
    );
    expect(finalBatch).toEqual({
      updatedProducts: 1,
      done: true,
      nextProductIndex: null,
    });
    const finalProduct = await t.run(async (ctx) => ctx.db.get(productIds[10]));
    expect(finalProduct).toMatchObject({
      featuredImageUrl: "https://cdn.shopify.com/new.jpg",
    });
  });

  test("keeps processing context available after the primary product is deleted", async () => {
    const t = convexTest(schema, modules);
    const { itemId, productId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const productId = await ctx.db.insert("products", {
        shopifyProductId: "gid://shopify/Product/deleted-after-seed",
        title: "Produit supprimé après seed",
        handle: "produit-supprime-apres-seed",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "transforming",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 0,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const itemId = await ctx.db.insert("bulkTransformItems", {
        jobId,
        productId,
        referencedProductIds: [productId],
        operation: "flip_horizontal",
        sourceMediaId: "gid://shopify/MediaImage/deleted-after-seed",
        sourceUrl: "https://cdn.shopify.com/source.jpg",
        sourcePosition: 0,
        status: "transforming",
        attempts: 1,
        publishAttempts: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(productId);
      return { itemId, productId };
    });

    const context = await t.query(
      internal.bulkTransforms.getProcessingContext,
      { itemId },
    );
    expect(context?.item.productId).toBe(productId);
    expect(context?.job.status).toBe("transforming");
  });

  test("lists scoped bulk history newest first including archived results", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "history.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const otherShopId = await ctx.db.insert("shops", {
        domain: "other-history.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/history",
        title: "Produit historique",
        handle: "produit-historique",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const base = {
        createdByUserId: userId,
        operation: "flip_horizontal" as const,
        productIds: [productId],
        selectedImagePositions: [1],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 1,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
      };
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        shopId,
        status: "completed",
        publishedItems: 1,
        createdAt: 10,
        updatedAt: 10,
        completedAt: 10,
        dismissedAt: 11,
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        shopId,
        status: "publishing",
        createdAt: 20,
        updatedAt: 20,
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        shopId,
        status: "failed",
        createdAt: 30,
        updatedAt: 30,
        completedAt: 30,
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        shopId,
        status: "partial",
        createdAt: 30,
        updatedAt: 31,
        completedAt: 31,
      });
      await ctx.db.insert("bulkTransformJobs", {
        ...base,
        shopId: otherShopId,
        status: "failed",
        createdAt: 40,
        updatedAt: 40,
        completedAt: 40,
      });
      return userId;
    });

    const newest = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.list, { cursor: null, limit: 1 });
    expect(newest).toMatchObject({ limit: 1, hasNext: true });
    expect(newest.page[0]).toMatchObject({ status: "partial" });
    expect(newest.continueCursor).not.toBeNull();

    const middle = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.list, {
        cursor: newest.continueCursor!,
        limit: 1,
      });
    expect(middle.page).toHaveLength(1);
    expect(middle.page[0]).toMatchObject({
      status: "failed",
      productCount: 1,
      selectedImagePositions: [1],
    });

    expect(middle.continueCursor).not.toBeNull();

    const publishing = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.list, {
        cursor: middle.continueCursor!,
        limit: 1,
      });
    expect(publishing.page[0]).toMatchObject({ status: "publishing" });
    expect(publishing.continueCursor).not.toBeNull();

    const oldest = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.list, {
        cursor: publishing.continueCursor!,
        limit: 1,
      });
    expect(oldest.page[0]).toMatchObject({
      status: "completed",
      dismissedAt: 11,
    });
    expect(oldest.hasNext).toBe(false);
  });

  test("locks retries before deleting expired R2 assets", async () => {
    const t = convexTest(schema, modules);
    const { jobId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "cleanup.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/cleanup",
        title: "Produit cleanup",
        handle: "produit-cleanup",
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        shopId,
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "partial",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 1,
        totalItems: 1,
        transformedItems: 0,
        transformFailedItems: 1,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        completedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { jobId, userId };
    });

    const lease = await t.mutation(internal.bulkTransforms.claimAssetsCleanup, {
      jobId,
      cutoff: 2,
    });
    expect(lease).toMatchObject({ jobId });
    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.bulkTransforms.retryFailures, { jobId }),
    ).rejects.toThrow("can no longer be retried");

    expect(
      await t.mutation(internal.bulkTransforms.claimAssetsCleanup, {
        jobId,
        cutoff: 2,
      }),
    ).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        assetsCleanupStartedAt: Date.now() - 31 * 60 * 1000,
      });
    });
    while (Date.now() === lease!.leaseStartedAt) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const reclaimed = await t.mutation(
      internal.bulkTransforms.claimAssetsCleanup,
      { jobId, cutoff: 2 },
    );
    expect(reclaimed?.leaseStartedAt).not.toBe(lease?.leaseStartedAt);
    expect(
      await t.mutation(internal.bulkTransforms.markAssetsCleaned, {
        jobId,
        cutoff: 2,
        leaseStartedAt: lease!.leaseStartedAt,
      }),
    ).toBeNull();
    expect(
      await t.mutation(internal.bulkTransforms.markAssetsCleaned, {
        jobId,
        cutoff: 2,
        leaseStartedAt: reclaimed!.leaseStartedAt,
      }),
    ).toBe(jobId);
  });
});
