/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../../_generated/api";
import { BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS } from "../../bulkTransforms/model";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

describe("bulk transform workflow counters", () => {
  test("cancels an active publication without a late callback reviving it", async () => {
    const t = convexTest(schema, modules);
    const { itemId, jobId, leaseToken, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "cancel-publish.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/cancel-publish",
        title: "Produit à annuler",
        handle: "produit-annuler",
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
        status: "publishing",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 2,
        totalItems: 2,
        transformedItems: 2,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const leaseToken = "cancel-publish-lease";
      const itemId = await ctx.db.insert("bulkTransformItems", {
        shopId,
        jobId,
        productId,
        referencedProductIds: [productId],
        operation: "flip_horizontal",
        sourceMediaId: "gid://shopify/MediaImage/cancel-publish",
        sourceUrl: "https://cdn.shopify.com/cancel-publish.png",
        sourcePosition: 0,
        status: "publishing",
        attempts: 1,
        publishAttempts: 1,
        publishLeaseToken: leaseToken,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("bulkTransformProductLocks", {
        shopId,
        productId,
        jobId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("bulkTransformMediaLeases", {
        shopDomain: "cancel-publish.myshopify.com",
        sourceMediaId: "gid://shopify/MediaImage/cancel-publish",
        jobId,
        itemId,
        leaseToken,
        expiresAt: Date.now() + 60_000,
        createdAt: 1,
        updatedAt: 1,
      });
      return { itemId, jobId, leaseToken, userId };
    });

    await t
      .withIdentity({ subject: userId })
      .mutation(api.bulkTransforms.cancel, { jobId });
    await t.mutation(internal.bulkTransforms.markPublished, {
      itemId,
      leaseToken,
      publishedUrl: "https://cdn.shopify.com/cancelled-late.webp",
    });

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      item: await ctx.db.get(itemId),
      productLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .first(),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .first(),
    }));
    expect(result.job).toMatchObject({
      status: "cancelled",
      publishedItems: 1,
    });
    expect(result.item?.status).toBe("published");
    expect(result.productLock).toBeNull();
    expect(result.mediaLease).toBeNull();
  });

  test("caps concurrent Shopify publications and refills the worker pool", async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const shopId = await ctx.db.insert("shops", {
        domain: "concurrent-publish.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/concurrent",
        title: "Produit concurrent",
        handle: "produit-concurrent",
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
        status: "publishing",
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 5,
        totalItems: 5,
        transformedItems: 5,
        transformFailedItems: 0,
        publishedItems: 0,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 5; index += 1) {
        await ctx.db.insert("bulkTransformItems", {
          shopId,
          jobId,
          productId,
          referencedProductIds: [productId],
          operation: "flip_horizontal",
          sourceMediaId: `gid://shopify/MediaImage/concurrent-${index}`,
          sourceUrl: `https://cdn.shopify.com/concurrent-${index}.jpg`,
          sourcePosition: index,
          status: "ready",
          attempts: 1,
          publishAttempts: 0,
          createdAt: index + 1,
          updatedAt: index + 1,
        });
      }
      return { jobId };
    });

    const claims = [];
    for (let worker = 0; worker < 4; worker += 1) {
      claims.push(
        await t.mutation(internal.bulkTransforms.claimNextPublish, { jobId }),
      );
    }
    expect(new Set(claims.map((claim) => claim?._id)).size).toBe(4);
    await expect(
      t.mutation(internal.bulkTransforms.claimNextPublish, { jobId }),
    ).resolves.toBeNull();

    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId: claims[0]!._id,
      leaseToken: claims[0]!.publishLeaseToken!,
      error: "terminal test failure",
      safeToRelease: true,
    });
    const replacement = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId },
    );
    expect(replacement).not.toBeNull();
    expect(claims.map((claim) => claim?._id)).not.toContain(replacement?._id);
  });

  test("finishes a publish conflict exactly once", async () => {
    const t = convexTest(schema, modules);
    const { itemId, jobId, leaseToken } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const shopId = await ctx.db.insert("shops", {
        domain: "publish-conflict.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
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
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("bulkTransformJobs", {
        shopId,
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
        shopId,
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
        publishLeaseToken: "lease-conflict-1",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("bulkTransformProductLocks", {
        shopId,
        productId,
        jobId,
        createdAt: 1,
        updatedAt: 1,
      });
      const leaseToken = "lease-conflict-1";
      await ctx.db.insert("bulkTransformMediaLeases", {
        shopDomain: "publish-conflict.myshopify.com",
        sourceMediaId: "gid://shopify/MediaImage/1",
        jobId,
        itemId,
        leaseToken,
        expiresAt: Date.now() + 60_000,
        createdAt: 1,
        updatedAt: 1,
      });
      return { itemId, jobId, leaseToken };
    });

    const args = {
      itemId,
      leaseToken,
      error: "source changed",
      conflict: true,
      safeToRelease: true,
    };
    await t.mutation(internal.bulkTransforms.markPublishFailed, args);
    await t.mutation(internal.bulkTransforms.markPublishFailed, args);

    const result = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      job: await ctx.db.get(jobId),
      lock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .first(),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .first(),
    }));
    expect(result.item?.status).toBe("conflict");
    expect(result.job).toMatchObject({
      status: "partial",
      conflictItems: 1,
      publishFailedItems: 0,
      publishedItems: 0,
    });
    expect(result.lock).toBeNull();
    expect(result.mediaLease).toBeNull();
  });

  test("keeps an ambiguous Shopify update leased until a fenced recovery", async () => {
    const t = convexTest(schema, modules);
    const { itemId, jobId, oldLeaseToken, productId } = await t.run(
      async (ctx) => {
        const userId = await ctx.db.insert("users", {});
        const shopId = await ctx.db.insert("shops", {
          domain: "ambiguous-publish.myshopify.com",
          createdByUserId: userId,
          createdAt: 1,
          updatedAt: 1,
        });
        const productId = await ctx.db.insert("products", {
          shopId,
          shopifyProductId: "gid://shopify/Product/ambiguous",
          title: "Produit ambigu",
          handle: "produit-ambigu",
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
        const oldLeaseToken = "ambiguous-attempt-1";
        const itemId = await ctx.db.insert("bulkTransformItems", {
          shopId,
          jobId,
          productId,
          referencedProductIds: [productId],
          operation: "flip_horizontal",
          sourceMediaId: "gid://shopify/MediaImage/ambiguous",
          sourceUrl: "https://cdn.shopify.com/ambiguous.jpg",
          sourcePosition: 0,
          status: "publishing",
          attempts: 1,
          publishAttempts: 1,
          publishLeaseToken: oldLeaseToken,
          fileUpdateAcceptedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("bulkTransformProductLocks", {
          shopId,
          productId,
          jobId,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("bulkTransformMediaLeases", {
          shopDomain: "ambiguous-publish.myshopify.com",
          sourceMediaId: "gid://shopify/MediaImage/ambiguous",
          jobId,
          itemId,
          leaseToken: oldLeaseToken,
          expiresAt: Date.now() + 60_000,
          createdAt: 1,
          updatedAt: 1,
        });
        return { itemId, jobId, oldLeaseToken, productId };
      },
    );

    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId,
      leaseToken: oldLeaseToken,
      error: "Shopify is still processing the accepted update",
      safeToRelease: false,
    });
    const recovering = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      job: await ctx.db.get(jobId),
      productLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
    }));
    expect(recovering.item).toMatchObject({
      status: "ready",
      publishRecoveryPending: true,
      publishAmbiguousSince: expect.any(Number),
      fileUpdateAcceptedAt: 1,
    });
    expect(recovering.item?.publishLeaseToken).toBeUndefined();
    expect(recovering.job).toMatchObject({
      status: "publishing",
      publishedItems: 0,
      publishFailedItems: 0,
    });
    expect(recovering.productLock?.jobId).toBe(jobId);
    expect(recovering.mediaLease?.leaseToken).toBe(oldLeaseToken);

    const prematureAttempt = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId },
    );
    expect(prematureAttempt).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, {
        publishAmbiguousSince:
          Date.now() - BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS - 1,
      });
    });
    const recoveredAttempt = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId },
    );
    expect(recoveredAttempt?.publishLeaseToken).not.toBe(oldLeaseToken);
    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId,
      leaseToken: oldLeaseToken,
      error: "late callback",
      conflict: true,
      safeToRelease: true,
    });
    const afterLateCallback = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
    }));
    expect(afterLateCallback.item?.status).toBe("publishing");
    expect(afterLateCallback.mediaLease?.leaseToken).toBe(
      recoveredAttempt!.publishLeaseToken,
    );

    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId,
      leaseToken: recoveredAttempt!.publishLeaseToken!,
      error: "A conflicting source appeared before settlement",
      conflict: true,
      safeToRelease: false,
    });
    const unsettledConflict = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      job: await ctx.db.get(jobId),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
    }));
    expect(unsettledConflict.item?.status).toBe("ready");
    expect(unsettledConflict.job?.conflictItems).toBe(0);
    expect(unsettledConflict.mediaLease?.leaseToken).toBe(
      recoveredAttempt!.publishLeaseToken,
    );
    const settledAttempt = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId },
    );
    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId,
      leaseToken: settledAttempt!.publishLeaseToken!,
      error: "Shopify returned to a stable source",
      safeToRelease: true,
    });
    const stableFailure = await t.run(async (ctx) => ({
      item: await ctx.db.get(itemId),
      mediaLease: await ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
    }));
    expect(stableFailure.item).toMatchObject({ status: "publish_failed" });
    expect(stableFailure.item?.fileUpdateAcceptedAt).toBeUndefined();
    expect(stableFailure.item?.publishAmbiguousSince).toBeUndefined();
    expect(stableFailure.mediaLease).toBeNull();
  });

  test("ignores a late cache refresh after a newer media publication", async () => {
    const t = convexTest(schema, modules);
    const { firstItemId, secondItemId, productId } = await t.run(
      async (ctx) => {
        const userId = await ctx.db.insert("users", {});
        const shopId = await ctx.db.insert("shops", {
          domain: "cache-fence.myshopify.com",
          createdByUserId: userId,
          createdAt: 1,
          updatedAt: 1,
        });
        const sourceMediaId = "gid://shopify/MediaImage/cache-fence";
        const productId = await ctx.db.insert("products", {
          shopId,
          shopifyProductId: "gid://shopify/Product/cache-fence",
          title: "Produit cache fence",
          handle: "produit-cache-fence",
          tags: [],
          collections: [],
          options: [],
          variants: [],
          metafields: [],
          currentShopifyImages: [
            {
              mediaId: sourceMediaId,
              url: "https://cdn.shopify.com/original.jpg",
            },
          ],
          generationStatus: "not_started",
          createdAt: 1,
          updatedAt: 1,
        });
        const jobFields = {
          shopId,
          createdByUserId: userId,
          operation: "flip_horizontal" as const,
          status: "completed" as const,
          productIds: [productId],
          seededProductCount: 1,
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
        };
        const firstJobId = await ctx.db.insert("bulkTransformJobs", jobFields);
        const secondJobId = await ctx.db.insert("bulkTransformJobs", {
          ...jobFields,
          createdAt: 2,
          updatedAt: 2,
          completedAt: 2,
        });
        const itemFields = {
          shopId,
          productId,
          referencedProductIds: [productId],
          operation: "flip_horizontal" as const,
          sourceMediaId,
          sourceUrl: "https://cdn.shopify.com/original.jpg",
          sourcePosition: 0,
          status: "published" as const,
          attempts: 1,
          publishAttempts: 1,
          createdAt: 1,
          updatedAt: 1,
        };
        const firstItemId = await ctx.db.insert("bulkTransformItems", {
          ...itemFields,
          jobId: firstJobId,
          transformedSha256: "first-sha",
          publishedUrl: "https://cdn.shopify.com/first.jpg",
        });
        const secondItemId = await ctx.db.insert("bulkTransformItems", {
          ...itemFields,
          jobId: secondJobId,
          transformedSha256: "second-sha",
          publishedUrl: "https://cdn.shopify.com/second.jpg",
          createdAt: 2,
          updatedAt: 2,
        });
        await ctx.db.insert("bulkTransformMediaPublicationHeads", {
          shopDomain: "cache-fence.myshopify.com",
          sourceMediaId,
          jobId: secondJobId,
          itemId: secondItemId,
          publishedAt: 2,
          updatedAt: 2,
        });
        return { firstItemId, secondItemId, productId };
      },
    );

    await t.mutation(internal.bulkTransforms.refreshPublishedProductCaches, {
      itemId: secondItemId,
      nextProductIndex: 0,
    });
    const lateRefresh = await t.mutation(
      internal.bulkTransforms.refreshPublishedProductCaches,
      { itemId: firstItemId, nextProductIndex: 0 },
    );
    const product = await t.run(async (ctx) => ctx.db.get(productId));
    expect(lateRefresh).toMatchObject({ updatedProducts: 0, done: true });
    expect(product?.currentShopifyImages[0]).toMatchObject({
      url: "https://cdn.shopify.com/second.jpg",
      displayUrl: expect.stringContaining("second-sha"),
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

  test("does not retry a job whose products overlap another active bulk", async () => {
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
    ).rejects.toThrow("1 selected product is already locked");
  });

  test("retries a job beside an active bulk on disjoint products", async () => {
    const t = convexTest(schema, modules);
    const { activeJobId, oldJobId, product1, product2, userId } = await t.run(
      async (ctx) => {
        const userId = await ctx.db.insert("users", {
          approvalStatus: "approved",
        });
        const shopId = await ctx.db.insert("shops", {
          domain: "disjoint-retry.myshopify.com",
          createdByUserId: userId,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.patch(userId, { activeShopId: shopId });
        const product1 = await ctx.db.insert("products", {
          shopId,
          shopifyProductId: "gid://shopify/Product/disjoint-retry-1",
          title: "Produit retry 1",
          handle: "produit-retry-1",
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
        const product2 = await ctx.db.insert("products", {
          shopId,
          shopifyProductId: "gid://shopify/Product/disjoint-retry-2",
          title: "Produit retry 2",
          handle: "produit-retry-2",
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
          seededProductCount: 1,
          seedAttempts: 0,
          seedFailedProducts: 0,
          seededItems: 1,
          totalItems: 1,
          transformedItems: 0,
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
          productIds: [product1],
          transformFailedItems: 1,
        });
        const activeJobId = await ctx.db.insert("bulkTransformJobs", {
          ...base,
          status: "queued",
          productIds: [product2],
          transformFailedItems: 0,
        });
        return { activeJobId, oldJobId, product1, product2, userId };
      },
    );

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.bulkTransforms.retryFailures, { jobId: oldJobId }),
    ).resolves.toEqual({ phase: "transform" });

    const result = await t.run(async (ctx) => ({
      oldJob: await ctx.db.get(oldJobId),
      firstLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product1))
        .unique(),
      secondLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product2))
        .unique(),
    }));
    expect(result.oldJob?.status).toBe("transforming");
    expect(result.firstLock?.jobId).toBe(oldJobId);
    expect(result.secondLock?.jobId).toBe(activeJobId);
  });

  test("bounds legacy product-lock initialization across stale jobs", async () => {
    const t = convexTest(schema, modules);
    const jobIds = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const shopId = await ctx.db.insert("shops", {
        domain: "stale-lock-budget.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const jobs = [];
      for (let jobIndex = 0; jobIndex < 3; jobIndex += 1) {
        const productIds = [];
        for (let productIndex = 0; productIndex < 201; productIndex += 1) {
          const suffix = `${jobIndex}-${productIndex}`;
          productIds.push(
            await ctx.db.insert("products", {
              shopId,
              shopifyProductId: `gid://shopify/Product/stale-${suffix}`,
              title: `Produit stale ${suffix}`,
              handle: `produit-stale-${suffix}`,
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
          );
        }
        jobs.push(
          await ctx.db.insert("bulkTransformJobs", {
            shopId,
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
          }),
        );
      }
      return jobs;
    });

    const firstPass = await t.mutation(
      internal.bulkTransforms.resumeStaleJobs,
      {},
    );
    expect(firstPass).toMatchObject({
      resumedSeeding: 2,
      deferredLegacyProductLocks: 1,
    });
    const afterFirstPass = await t.run(async (ctx) => ({
      jobs: await Promise.all(jobIds.map((jobId) => ctx.db.get(jobId))),
      locks: await ctx.db.query("bulkTransformProductLocks").take(1_000),
    }));
    expect(afterFirstPass.locks).toHaveLength(402);
    expect(
      afterFirstPass.jobs.filter((job) => job?.productLocksInitializedAt),
    ).toHaveLength(2);

    const secondPass = await t.mutation(
      internal.bulkTransforms.resumeStaleJobs,
      {},
    );
    expect(secondPass).toMatchObject({
      resumedSeeding: 1,
      deferredLegacyProductLocks: 0,
    });
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
    const { itemId, productIds, referenceCursor } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "shared-cache.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const productIds = await Promise.all(
        Array.from({ length: 11 }, (_, index) =>
          ctx.db.insert("products", {
            shopId,
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
        shopId,
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
        shopId,
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
      await ctx.db.insert("bulkTransformMediaPublicationHeads", {
        shopDomain: "shared-cache.myshopify.com",
        sourceMediaId: "gid://shopify/MediaImage/shared-cache",
        jobId,
        itemId,
        publishedAt: 1,
        updatedAt: 1,
      });
      for (const productId of productIds) {
        await ctx.db.insert("bulkTransformMediaProductReferences", {
          shopDomain: "shared-cache.myshopify.com",
          sourceMediaId: "gid://shopify/MediaImage/shared-cache",
          productId,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      const referencePage = await ctx.db
        .query("bulkTransformMediaProductReferences")
        .withIndex("by_shop_domain_and_source_media_id", (q) =>
          q
            .eq("shopDomain", "shared-cache.myshopify.com")
            .eq("sourceMediaId", "gid://shopify/MediaImage/shared-cache"),
        )
        .paginate({ cursor: null, numItems: 10 });
      return {
        itemId,
        productIds,
        referenceCursor: referencePage.continueCursor,
      };
    });

    const firstBatch = await t.mutation(
      internal.bulkTransforms.refreshPublishedProductCaches,
      { itemId, nextProductIndex: 0, referenceCursor: null },
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
      { itemId, nextProductIndex: 10, referenceCursor },
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

  test("caps rollback concurrency and fences stale publication caches", async () => {
    const t = convexTest(schema, modules);
    const { jobId, publicationHeadId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const shopId = await ctx.db.insert("shops", {
        domain: "rollback-concurrency.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const productId = await ctx.db.insert("products", {
        shopId,
        shopifyProductId: "gid://shopify/Product/rollback",
        title: "Produit rollback",
        handle: "produit-rollback",
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
        status: "cancelled",
        rollbackStatus: "running",
        rollbackTotalItems: 5,
        rollbackRunNumber: 1,
        productIds: [productId],
        seededProductCount: 1,
        seedAttempts: 0,
        seedFailedProducts: 0,
        seededItems: 5,
        totalItems: 5,
        transformedItems: 5,
        transformFailedItems: 0,
        publishedItems: 5,
        publishFailedItems: 0,
        conflictItems: 0,
        skippedItems: 0,
        unsupportedItems: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      let publicationHeadId = null;
      for (let index = 0; index < 5; index += 1) {
        const itemId = await ctx.db.insert("bulkTransformItems", {
          shopId,
          jobId,
          productId,
          referencedProductIds: [productId],
          operation: "flip_horizontal",
          sourceMediaId: `gid://shopify/MediaImage/rollback-${index}`,
          sourceUrl: `https://cdn.shopify.com/source-${index}.jpg`,
          sourcePosition: index,
          sourceSha256: `source-${index}`,
          transformedSha256: `transformed-${index}`,
          sourceBackupUrl: `https://r2.example.com/source-${index}.jpg`,
          publishedUrl: `https://cdn.shopify.com/transformed-${index}.webp`,
          status: "published",
          attempts: 1,
          publishAttempts: 1,
          createdAt: index + 1,
          updatedAt: index + 1,
        });
        if (index === 0) {
          publicationHeadId = await ctx.db.insert(
            "bulkTransformMediaPublicationHeads",
            {
              shopDomain: "rollback-concurrency.myshopify.com",
              sourceMediaId: `gid://shopify/MediaImage/rollback-${index}`,
              jobId,
              itemId,
              publishedAt: 1,
              updatedAt: 1,
            },
          );
        }
      }
      return { jobId, publicationHeadId };
    });

    const claims = [];
    for (let worker = 0; worker < 4; worker += 1) {
      claims.push(
        await t.mutation(internal.bulkTransforms.claimNextRollback, { jobId }),
      );
    }
    expect(new Set(claims.map((claim) => claim?._id)).size).toBe(4);
    await expect(
      t.mutation(internal.bulkTransforms.claimNextRollback, { jobId }),
    ).resolves.toBeNull();
    await t.mutation(internal.bulkTransforms.markRollbackRestored, {
      itemId: claims[0]!._id,
      leaseToken: claims[0]!.rollbackLeaseToken!,
      resolvedUrl: "https://cdn.shopify.com/restored-0.jpg",
      resolvedSha256: "source-0",
    });
    expect(
      await t.mutation(internal.bulkTransforms.claimNextRollback, { jobId }),
    ).not.toBeNull();
    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      head: publicationHeadId ? await ctx.db.get(publicationHeadId) : null,
    }));
    expect(result.job?.rolledBackItems).toBe(1);
    expect(result.head).toBeNull();
    expect(
      await t.mutation(internal.bulkTransforms.refreshPublishedProductCaches, {
        itemId: claims[0]!._id,
        nextProductIndex: 0,
      }),
    ).toMatchObject({ done: true, updatedProducts: 0 });
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
