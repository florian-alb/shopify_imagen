/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

function productFields(
  shopId: Id<"shops">,
  index: number,
  mediaId = "gid://shopify/MediaImage/lock-" + index,
) {
  return {
    shopId,
    shopifyProductId: "gid://shopify/Product/lock-" + index,
    title: "Produit lock " + index,
    handle: "produit-lock-" + index,
    tags: [],
    collections: [],
    options: [],
    variants: [],
    metafields: [],
    currentShopifyImages: [
      {
        mediaId,
        url: "https://cdn.shopify.com/lock-" + index + ".jpg",
      },
    ],
    generationStatus: "not_started" as const,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("bulk transform product locks", () => {
  test("allows disjoint jobs and rolls back a partially overlapping selection", async () => {
    const t = convexTest(schema, modules);
    const { product1, product2, product3, shopId, userId } = await t.run(
      async (ctx) => {
        const userId = await ctx.db.insert("users", {
          approvalStatus: "approved",
        });
        const shopId = await ctx.db.insert("shops", {
          domain: "product-locks.myshopify.com",
          createdByUserId: userId,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.patch(userId, { activeShopId: shopId });
        const product1 = await ctx.db.insert(
          "products",
          productFields(shopId, 1),
        );
        const product2 = await ctx.db.insert(
          "products",
          productFields(shopId, 2),
        );
        const product3 = await ctx.db.insert(
          "products",
          productFields(shopId, 3),
        );
        return { product1, product2, product3, shopId, userId };
      },
    );

    const firstJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [product1],
      operation: "flip_horizontal",
    });
    const secondJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [product2],
      operation: "flip_horizontal",
    });

    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds: [product3, product1],
        operation: "flip_horizontal",
      }),
    ).rejects.toThrow("1 selected product is already locked");

    const state = await t.run(async (ctx) => ({
      firstJob: await ctx.db.get(firstJobId),
      secondJob: await ctx.db.get(secondJobId),
      firstLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product1))
        .unique(),
      secondLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product2))
        .unique(),
      rolledBackLock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product3))
        .unique(),
      queuedJobs: await ctx.db
        .query("bulkTransformJobs")
        .withIndex("by_shop_and_status", (q) =>
          q.eq("shopId", shopId).eq("status", "queued"),
        )
        .take(10),
    }));
    expect(state.firstJob).toMatchObject({
      totalItems: 1,
      productLocksInitializedAt: expect.any(Number),
    });
    expect(state.secondJob).toMatchObject({
      totalItems: 1,
      productLocksInitializedAt: expect.any(Number),
    });
    expect(state.firstLock?.jobId).toBe(firstJobId);
    expect(state.secondLock?.jobId).toBe(secondJobId);
    expect(state.rolledBackLock).toBeNull();
    expect(state.queuedJobs).toHaveLength(2);
  });

  test("serializes publication of a Shopify media shared by disjoint products", async () => {
    const t = convexTest(schema, modules);
    const sharedMediaId = "gid://shopify/MediaImage/shared-publication";
    const { product1, product2, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "shared-media-lock.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const product1 = await ctx.db.insert(
        "products",
        productFields(shopId, 5, sharedMediaId),
      );
      const product2 = await ctx.db.insert(
        "products",
        productFields(shopId, 6, sharedMediaId),
      );
      return { product1, product2, userId };
    });

    const firstJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [product1],
      operation: "flip_horizontal",
    });
    const secondJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [product2],
      operation: "flip_horizontal",
    });

    const prepareForPublication = async (
      jobId: Id<"bulkTransformJobs">,
      productIndex: number,
    ) => {
      await t.mutation(internal.bulkTransforms.storeSeededProduct, {
        jobId,
        productIndex: 0,
        skippedItems: 0,
        images: [
          {
            mediaId: sharedMediaId,
            url: `https://cdn.shopify.com/shared-${productIndex}.jpg`,
            altText: null,
            position: 0,
          },
        ],
      });
      const claimed = await t.mutation(
        internal.bulkTransforms.claimNextTransform,
        { jobId },
      );
      await t.mutation(internal.bulkTransforms.markTransformReady, {
        itemId: claimed!._id,
        sourceUrl: `https://cdn.shopify.com/shared-${productIndex}.jpg`,
        sourceSha256: `source-${productIndex}`,
        transformedSha256: `output-${productIndex}`,
        sourceBackupUrl: `https://r2.example/source-${productIndex}.jpg`,
        outputUrl: `https://r2.example/output-${productIndex}.webp`,
      });
      await t.mutation(internal.bulkTransforms.startPublishing, {
        jobId,
        userId,
      });
    };

    await prepareForPublication(firstJobId, 1);
    await prepareForPublication(secondJobId, 2);
    const firstItem = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId: firstJobId },
    );
    const blockedSecondItem = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId: secondJobId },
    );
    expect(firstItem?.publishLeaseToken).toEqual(expect.any(String));
    expect(blockedSecondItem).toBeNull();

    await t.mutation(internal.bulkTransforms.markPublished, {
      itemId: firstItem!._id,
      leaseToken: firstItem!.publishLeaseToken!,
      publishedUrl: "https://cdn.shopify.com/shared-first.jpg",
    });
    await t.mutation(internal.bulkTransforms.refreshPublishedProductCaches, {
      itemId: firstItem!._id,
      nextProductIndex: 0,
    });
    const sharedProductCaches = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(product1), ctx.db.get(product2)]),
    );
    expect(sharedProductCaches[0]?.currentShopifyImages[0]).toMatchObject({
      url: "https://cdn.shopify.com/shared-first.jpg",
    });
    expect(sharedProductCaches[1]?.currentShopifyImages[0]).toMatchObject({
      url: "https://cdn.shopify.com/shared-first.jpg",
    });
    const secondItem = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId: secondJobId },
    );
    expect(secondItem?.publishLeaseToken).toEqual(expect.any(String));

    await t.mutation(internal.bulkTransforms.markPublished, {
      itemId: firstItem!._id,
      leaseToken: firstItem!.publishLeaseToken!,
      publishedUrl: "https://cdn.shopify.com/shared-late.jpg",
    });
    const activeLease = await t.run(async (ctx) =>
      ctx.db
        .query("bulkTransformMediaLeases")
        .withIndex("by_shop_domain_and_source_media_id", (q) =>
          q
            .eq("shopDomain", "shared-media-lock.myshopify.com")
            .eq("sourceMediaId", sharedMediaId),
        )
        .unique(),
    );
    expect(activeLease).toMatchObject({
      jobId: secondJobId,
      itemId: secondItem!._id,
      leaseToken: secondItem!.publishLeaseToken,
    });

    await t.mutation(internal.bulkTransforms.markPublishFailed, {
      itemId: secondItem!._id,
      leaseToken: secondItem!.publishLeaseToken!,
      error: "source changed after serialized publication",
      conflict: true,
      safeToRelease: true,
    });
  });

  test("protects and lazily migrates an existing ready job", async () => {
    const t = convexTest(schema, modules);
    const { legacyJobId, product1, product2, userId } = await t.run(
      async (ctx) => {
        const userId = await ctx.db.insert("users", {
          approvalStatus: "approved",
        });
        const shopId = await ctx.db.insert("shops", {
          domain: "legacy-product-lock.myshopify.com",
          createdByUserId: userId,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.patch(userId, { activeShopId: shopId });
        const product1 = await ctx.db.insert(
          "products",
          productFields(shopId, 11),
        );
        const product2 = await ctx.db.insert(
          "products",
          productFields(shopId, 12),
        );
        const legacyJobId = await ctx.db.insert("bulkTransformJobs", {
          shopId,
          createdByUserId: userId,
          operation: "flip_horizontal",
          status: "ready",
          productIds: [product1],
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
          readyAt: 1,
        });
        return { legacyJobId, product1, product2, userId };
      },
    );

    const visibleLocks = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.productLocks, {
        productIds: [product1, product2],
      });
    expect(visibleLocks).toEqual([
      {
        productId: product1,
        jobId: legacyJobId,
        status: "ready",
      },
    ]);
    const selection = await t
      .withIdentity({ subject: userId })
      .query(api.bulkTransforms.selectionOptions, {
        productIds: [product1],
      });
    expect(selection.lockedProducts).toMatchObject([
      {
        productId: product1,
        productTitle: "Produit lock 11",
        jobId: legacyJobId,
        status: "ready",
      },
    ]);

    await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [product2],
      operation: "flip_horizontal",
    });
    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds: [product1],
        operation: "flip_horizontal",
      }),
    ).rejects.toThrow("already locked");

    const migrated = await t.run(async (ctx) => ({
      job: await ctx.db.get(legacyJobId),
      lock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", product1))
        .unique(),
    }));
    expect(migrated.job?.productLocksInitializedAt).toEqual(expect.any(Number));
    expect(migrated.lock?.jobId).toBe(legacyJobId);
  });

  test("keeps a ready lock and releases it only after publication completes", async () => {
    const t = convexTest(schema, modules);
    const { productId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "ready-product-lock.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert(
        "products",
        productFields(shopId, 21),
      );
      return { productId, userId };
    });
    const jobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [productId],
      operation: "flip_horizontal",
    });
    await t.mutation(internal.bulkTransforms.storeSeededProduct, {
      jobId,
      productIndex: 0,
      skippedItems: 0,
      images: [
        {
          mediaId: "gid://shopify/MediaImage/lock-21",
          url: "https://cdn.shopify.com/lock-21.jpg",
          altText: null,
          position: 0,
        },
      ],
    });
    const claimed = await t.mutation(
      internal.bulkTransforms.claimNextTransform,
      { jobId },
    );
    expect(claimed).not.toBeNull();
    await t.mutation(internal.bulkTransforms.markTransformReady, {
      itemId: claimed!._id,
      sourceUrl: "https://cdn.shopify.com/lock-21.jpg",
      sourceSha256: "source-21",
      transformedSha256: "mirror-21",
      sourceBackupUrl: "https://r2.example/source-21.jpg",
      outputUrl: "https://r2.example/mirror-21.webp",
    });
    const readyState = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      lock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    }));
    expect(readyState.job?.status).toBe("ready");
    expect(readyState.lock?.jobId).toBe(jobId);

    await t.mutation(internal.bulkTransforms.startPublishing, {
      jobId,
      userId,
    });
    const publishingItem = await t.mutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId },
    );
    expect(publishingItem).not.toBeNull();
    await t.mutation(internal.bulkTransforms.markPublished, {
      itemId: publishingItem!._id,
      leaseToken: publishingItem!.publishLeaseToken!,
      publishedUrl: "https://cdn.shopify.com/published-21.jpg",
    });
    const completedState = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      lock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    }));
    expect(completedState.job?.status).toBe("completed");
    expect(completedState.lock).toBeNull();

    const nextJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [productId],
      operation: "flip_horizontal",
    });
    await t.mutation(internal.bulkTransforms.markPublished, {
      itemId: publishingItem!._id,
      leaseToken: publishingItem!.publishLeaseToken!,
      publishedUrl: "https://cdn.shopify.com/published-21.jpg",
    });
    const lockAfterLateCallback = await t.run(async (ctx) =>
      ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    );
    expect(lockAfterLateCallback?.jobId).toBe(nextJobId);
  });

  test("releases locks on cancellation and terminal seed failure", async () => {
    const t = convexTest(schema, modules);
    const { productId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "released-product-lock.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert(
        "products",
        productFields(shopId, 31),
      );
      return { productId, userId };
    });
    const cancelledJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [productId],
      operation: "flip_horizontal",
    });
    await t
      .withIdentity({ subject: userId })
      .mutation(api.bulkTransforms.cancel, { jobId: cancelledJobId });

    const failedJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [productId],
      operation: "flip_horizontal",
    });
    await t.mutation(internal.bulkTransforms.recordSeedFailure, {
      jobId: failedJobId,
      productIndex: 0,
      error: "Shopify unavailable",
      retryable: false,
    });
    const afterFailure = await t.run(async (ctx) => ({
      job: await ctx.db.get(failedJobId),
      lock: await ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    }));
    expect(afterFailure.job?.status).toBe("failed");
    expect(afterFailure.lock).toBeNull();

    await expect(
      t.mutation(internal.bulkTransforms.createJob, {
        userId,
        productIds: [productId],
        operation: "flip_horizontal",
      }),
    ).resolves.toBeDefined();
  });

  test("reclaims an orphaned lock whose owner is terminal", async () => {
    const t = convexTest(schema, modules);
    const { ownerJobId, productId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "orphan-product-lock.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      const productId = await ctx.db.insert(
        "products",
        productFields(shopId, 41),
      );
      const ownerJobId = await ctx.db.insert("bulkTransformJobs", {
        shopId,
        createdByUserId: userId,
        operation: "flip_horizontal",
        status: "cancelled",
        productIds: [productId],
        productLocksInitializedAt: 1,
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
        completedAt: 1,
      });
      await ctx.db.insert("bulkTransformProductLocks", {
        shopId,
        productId,
        jobId: ownerJobId,
        createdAt: 1,
        updatedAt: 1,
      });
      return { ownerJobId, productId, userId };
    });

    const newJobId = await t.mutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: [productId],
      operation: "flip_horizontal",
    });
    const lock = await t.run(async (ctx) =>
      ctx.db
        .query("bulkTransformProductLocks")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    );
    expect(lock?.jobId).toBe(newJobId);
    expect(lock?.jobId).not.toBe(ownerJobId);
  });

  test("does not serialize equal media gids from different Shopify domains", async () => {
    const t = convexTest(schema, modules);
    const { firstJobId, secondJobId } = await t.run(async (ctx) => {
      const sharedMediaId = "gid://shopify/MediaImage/domain-local-id";
      const createPublishingJob = async (domain: string, index: number) => {
        const userId = await ctx.db.insert("users", {});
        const shopId = await ctx.db.insert("shops", {
          domain,
          createdByUserId: userId,
          createdAt: index,
          updatedAt: index,
        });
        const productId = await ctx.db.insert(
          "products",
          productFields(shopId, 100 + index, sharedMediaId),
        );
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
          createdAt: index,
          updatedAt: index,
        });
        await ctx.db.insert("bulkTransformItems", {
          shopId,
          jobId,
          productId,
          referencedProductIds: [productId],
          operation: "flip_horizontal",
          sourceMediaId: sharedMediaId,
          sourceUrl: `https://cdn.shopify.com/domain-${index}.jpg`,
          sourcePosition: 0,
          status: "ready",
          attempts: 1,
          publishAttempts: 0,
          createdAt: index,
          updatedAt: index,
        });
        return jobId;
      };
      return {
        firstJobId: await createPublishingJob(
          "first-domain.myshopify.com",
          1,
        ),
        secondJobId: await createPublishingJob(
          "second-domain.myshopify.com",
          2,
        ),
      };
    });

    const [firstItem, secondItem] = await Promise.all([
      t.mutation(internal.bulkTransforms.claimNextPublish, {
        jobId: firstJobId,
      }),
      t.mutation(internal.bulkTransforms.claimNextPublish, {
        jobId: secondJobId,
      }),
    ]);
    expect(firstItem?.publishLeaseToken).toEqual(expect.any(String));
    expect(secondItem?.publishLeaseToken).toEqual(expect.any(String));
    const leases = await t.run(async (ctx) =>
      ctx.db.query("bulkTransformMediaLeases").take(10),
    );
    expect(leases.map((lease) => lease.shopDomain).sort()).toEqual([
      "first-domain.myshopify.com",
      "second-domain.myshopify.com",
    ]);
  });
});
