// @vitest-environment node
/// <reference types="vite/client" />

import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { shopifyGraphql } from "../../shopify/client";
import {
  GENERATED_MEDIA_STATUS_QUERY,
  PRODUCT_DELETE_MEDIA_MUTATION,
  PRODUCT_QUERY,
  PRODUCT_UPDATE_MEDIA_MUTATION,
} from "../../shopify/graphql";

vi.mock("../../shopify/client", () => ({
  shopifyGraphql: vi.fn(),
  getAccessToken: vi.fn(),
}));
const modules = import.meta.glob("../../**/*.ts");
const graphql = vi.mocked(shopifyGraphql);

beforeEach(() => {
  vi.useFakeTimers();
  graphql.mockReset();
  graphql.mockImplementation(async (query, variables) => {
    if (query.includes("query ProductPublicationMedia"))
      return {
        product: {
          media: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    if (query === PRODUCT_UPDATE_MEDIA_MUTATION) {
      const input = variables as {
        product: { id: string };
        media: Array<{ alt: string }>;
      };
      return {
        productUpdate: {
          userErrors: [],
          product: {
            media: {
              nodes: input.media.map((media, i) => ({
                id: `${input.product.id}-media-${i}`,
                alt: media.alt,
              })),
            },
          },
        },
      };
    }
    if (query === GENERATED_MEDIA_STATUS_QUERY)
      return {
        nodes: (variables as { mediaIds: string[] }).mediaIds.map((id) => ({
          id,
          status: "READY",
        })),
      };
    if (query === PRODUCT_DELETE_MEDIA_MUTATION)
      return { productDeleteMedia: { mediaUserErrors: [] } };
    if (query === PRODUCT_QUERY) return { product: null };
    throw new Error("Unexpected Shopify operation");
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fixture(productCount = 3) {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "original.myshopify.com",
      clientId: "test",
      clientSecret: "test",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productIds: Id<"products">[] = [];
    for (let index = 0; index < productCount; index++) {
      productIds.push(
        await ctx.db.insert("products", {
          shopId,
          shopifyProductId: `product-${index}`,
          title: `Peluche ${index}`,
          handle: `peluche-${index}`,
          tags: [],
          collections: [],
          options: [],
          variants: [],
          metafields: [],
          currentShopifyImages: [],
          generationStatus: "ready",
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    const jobId = await ctx.db.insert("generationJobs", {
      shopId,
      productIds,
      selectedImageTypes: ["Hero"],
      forceRegenerate: true,
      status: "completed",
      mode: "bulk",
      totalTasks: productCount,
      completedTasks: productCount,
      failedTasks: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageIds: Id<"generatedImages">[] = [];
    for (const [index, productId] of productIds.entries()) {
      imageIds.push(
        await ctx.db.insert("generatedImages", {
          shopId,
          productId,
          jobId,
          imageType: "Hero",
          promptUsed: "Prompt",
          storageUrl: `https://example.com/${index}.jpg`,
          status: "generated",
          reviewStatus: "approved",
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { userId, shopId, jobId, productIds, imageIds };
  });
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids };
}

describe("durable job image publication", () => {
  test("executes without further browser requests and uses the initiating shop after a switch", async () => {
    const { t, client, userId, jobId, imageIds } = await fixture();
    const runId = await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: false,
    });
    expect(graphql).not.toHaveBeenCalled();
    await t.run(async (ctx) => {
      const otherShop = await ctx.db.insert("shops", {
        domain: "other.myshopify.com",
        clientId: "other",
        clientSecret: "other",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: otherShop });
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({
      status: "completed",
      totalProducts: 3,
      processedProducts: 3,
      failedProducts: 0,
      totalImages: 3,
      pushedImages: 3,
    });
    expect(
      graphql.mock.calls.every(
        (call) => call[3]?.domain === "original.myshopify.com",
      ),
    ).toBe(true);
    const images = await Promise.all(
      imageIds.map((id) => t.run((ctx) => ctx.db.get(id))),
    );
    expect(images.map((image) => image?.status)).toEqual([
      "uploaded",
      "uploaded",
      "uploaded",
    ]);
  });

  test("records an individual failure and publishes the next products without retrying the failed write", async () => {
    const { t, client, jobId, imageIds } = await fixture();
    const implementation = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, variables, ...rest) => {
      if (
        query === PRODUCT_UPDATE_MEDIA_MUTATION &&
        (variables as { product: { id: string } }).product.id === "product-0"
      )
        throw new Error("Shopify unavailable");
      return implementation(query, variables, ...rest);
    });
    await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(
      await client.query(api.jobImagePublishing.latest, { jobId }),
    ).toMatchObject({
      status: "completed_with_errors",
      processedProducts: 3,
      failedProducts: 1,
      pushedImages: 2,
      errors: [
        {
          productTitle: "Peluche 0",
          error: expect.stringContaining("Shopify unavailable"),
        },
      ],
    });
    expect(
      graphql.mock.calls.filter(
        (call) =>
          call[0] === PRODUCT_UPDATE_MEDIA_MUTATION &&
          (call[1] as { product: { id: string } }).product.id === "product-0",
      ),
    ).toHaveLength(1);
  });

  test("simultaneous starts share one frozen selection and preserve the replace option", async () => {
    const { t, client, jobId, imageIds } = await fixture();
    const [first, second] = await Promise.all([
      client.mutation(api.jobImagePublishing.start, {
        jobId,
        imageIds: [imageIds[0]],
        replaceExisting: false,
      }),
      client.mutation(api.jobImagePublishing.start, {
        jobId,
        imageIds,
        replaceExisting: true,
      }),
    ]);
    expect(first).toBe(second);
    const run = await t.run((ctx) => ctx.db.get(first));
    expect(run).toMatchObject({ totalImages: 1, replaceExisting: false });
    const items = await t.run((ctx) =>
      ctx.db
        .query("imagePublishProducts")
        .withIndex("by_runId_and_position", (q) => q.eq("runId", first))
        .take(501),
    );
    expect(items).toHaveLength(1);
    expect(items[0].images.map((image) => image.imageId)).toEqual([
      imageIds[0],
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
  });

  test("does not publish a source changed after the selection was frozen", async () => {
    const { t, client, jobId, imageIds } = await fixture(1);
    await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: true,
    });
    await t.run((ctx) =>
      ctx.db.patch(imageIds[0], {
        storageUrl: "https://example.com/retouched.jpg",
      }),
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(graphql).not.toHaveBeenCalled();
    expect(
      await client.query(api.jobImagePublishing.latest, { jobId }),
    ).toMatchObject({
      status: "completed_with_errors",
      failedProducts: 1,
      pushedImages: 0,
      errors: [
        {
          productTitle: "Peluche 0",
          error: expect.stringContaining("a changé"),
        },
      ],
    });
  });

  test("counts partial uploads when gallery deletion fails and keeps the product error", async () => {
    const { t, client, jobId, productIds, imageIds } = await fixture(1);
    await t.run((ctx) =>
      ctx.db.patch(productIds[0], {
        currentShopifyImages: [
          {
            id: "old-media",
            mediaId: "old-media",
            url: "https://example.com/old.jpg",
          },
        ],
      }),
    );
    const implementation = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, variables, ...rest) => {
      if (query === PRODUCT_DELETE_MEDIA_MUTATION)
        throw new Error("Deletion failed");
      return implementation(query, variables, ...rest);
    });
    await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(
      await client.query(api.jobImagePublishing.latest, { jobId }),
    ).toMatchObject({
      status: "completed_with_errors",
      failedProducts: 1,
      pushedImages: 1,
      errors: [
        {
          productTitle: "Peluche 0",
          error: expect.stringContaining("Deletion failed"),
        },
      ],
    });
  });

  test("rejects missing authentication, revoked approval, foreign jobs, and unapproved or published images", async () => {
    const { t, client, userId, jobId, imageIds } = await fixture(1);
    const args = { jobId, imageIds, replaceExisting: false };
    await expect(
      t.mutation(api.jobImagePublishing.start, args),
    ).rejects.toThrow("Authentication required");
    for (const change of [
      { reviewStatus: "rejected" as const },
      { status: "uploaded" as const },
      { shopifyMediaId: "already-published" },
    ]) {
      await t.run((ctx) =>
        ctx.db.patch(imageIds[0], {
          status: "generated",
          reviewStatus: "approved",
          shopifyMediaId: undefined,
          ...change,
        }),
      );
      await expect(
        client.mutation(api.jobImagePublishing.start, args),
      ).rejects.toThrow("uniquement");
    }
    await t.run((ctx) =>
      ctx.db.patch(imageIds[0], {
        status: "generated",
        shopifyMediaId: undefined,
      }),
    );
    await expect(
      client.mutation(api.jobImagePublishing.start, {
        ...args,
        imageIds: [imageIds[0], imageIds[0]],
      }),
    ).rejects.toThrow("double");
    await t.run((ctx) => ctx.db.patch(userId, { approvalStatus: "rejected" }));
    await expect(
      client.mutation(api.jobImagePublishing.start, args),
    ).rejects.toThrow("approval");
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { approvalStatus: "approved" });
      const otherShop = await ctx.db.insert("shops", {
        domain: "foreign.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(jobId, { shopId: otherShop });
    });
    await expect(
      client.mutation(api.jobImagePublishing.start, args),
    ).rejects.toThrow("introuvable");
    expect(await client.query(api.jobImagePublishing.latest, { jobId })).toBe(
      null,
    );
  });

  test("rechecks account approval before a worker writes to Shopify", async () => {
    const { t, client, userId, jobId, imageIds } = await fixture(1);
    const runId = await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: false,
    });
    await t.run((ctx) => ctx.db.patch(userId, { approvalStatus: "rejected" }));
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(graphql).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({
      status: "completed_with_errors",
      failedProducts: 1,
    });
  });

  test("rejects oversized selections and images from another generation job", async () => {
    const { t, client, jobId, imageIds } = await fixture(1);
    await expect(
      client.mutation(api.jobImagePublishing.start, {
        jobId,
        imageIds: [],
        replaceExisting: false,
      }),
    ).rejects.toThrow("entre 1 et 1000");
    await expect(
      client.mutation(api.jobImagePublishing.start, {
        jobId,
        imageIds: Array.from({ length: 1001 }, () => imageIds[0]),
        replaceExisting: false,
      }),
    ).rejects.toThrow("entre 1 et 1000");
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(jobId))!;
      const { _id, _creationTime, ...fields } = job;
      const otherJobId = await ctx.db.insert("generationJobs", fields);
      await ctx.db.patch(imageIds[0], { jobId: otherJobId });
    });
    await expect(
      client.mutation(api.jobImagePublishing.start, {
        jobId,
        imageIds,
        replaceExisting: false,
      }),
    ).rejects.toThrow("de ce job");
    expect(graphql).not.toHaveBeenCalled();
    expect(await client.query(api.jobImagePublishing.latest, { jobId })).toBe(
      null,
    );
  });

  test("prevents removing a generation job while its publication is active", async () => {
    const { t, client, jobId, imageIds } = await fixture(1);
    await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: false,
    });
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow(
      "publication",
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    await expect(client.mutation(api.jobs.remove, { jobId })).resolves.toBe(
      null,
    );
  });

  test("recording a finished product again leaves progress unchanged", async () => {
    const { t, client, jobId, imageIds } = await fixture(1);
    const runId = await client.mutation(api.jobImagePublishing.start, {
      jobId,
      imageIds,
      replaceExisting: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    const item = await t.run((ctx) =>
      ctx.db
        .query("imagePublishProducts")
        .withIndex("by_runId_and_position", (q) => q.eq("runId", runId))
        .first(),
    );
    await t.mutation(internal.jobImagePublishing.recordProduct, {
      itemId: item!._id,
      pushedImages: 1,
    });
    expect(
      await client.query(api.jobImagePublishing.latest, { jobId }),
    ).toMatchObject({ processedProducts: 1, pushedImages: 1 });
  });
});
