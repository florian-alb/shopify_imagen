/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");
const LEASE_MS = 11 * 60 * 1000;

async function seedPostprocessingJob(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
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
      generationStatus: "generating",
      createdAt: 1,
      updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      status: "running",
      mode: "single",
      executionMode: "batch",
      imageProvider: "openai",
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      forceRegenerate: false,
      totalTasks: 9,
      completedTasks: 0,
      failedTasks: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageIds = [];
    for (let index = 0; index < 9; index += 1) {
      imageIds.push(
        await ctx.db.insert("generatedImages", {
          productId,
          jobId,
          imageType: `Hero ${index + 1}`,
          promptUsed: "Prompt",
          status: "postprocessing",
          postProcessingInputUrl: `https://example.com/staged-${index}.png`,
          postProcessingStartedAt: null,
          generatedImageUrl: null,
          storageUrl: null,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { jobId, imageIds };
  });
}

afterEach(() => vi.restoreAllMocks());

describe("postprocessing worker leases", () => {
  test("shares the per-job capacity across workers and replenishes one finished slot", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const t = convexTest(schema, modules);
    const { jobId, imageIds } = await seedPostprocessingJob(t);

    const firstWorker = await t.mutation(
      internal.jobs.claimPostprocessingImages,
      {
        jobId,
        limit: 3,
      },
    );
    expect(firstWorker).toHaveLength(3);
    expect(new Set(firstWorker.map((image) => image._id)).size).toBe(3);

    const secondWorker = await t.mutation(
      internal.jobs.claimPostprocessingImages,
      {
        jobId,
        limit: 3,
      },
    );
    expect(secondWorker).toEqual([]);

    const finishedImage = firstWorker[0]!;
    expect(
      await t.mutation(internal.jobs.completeImage, {
        imageId: finishedImage._id,
        expectedPostProcessingStartedAt: finishedImage.postProcessingStartedAt!,
        generatedImageUrl: "https://example.com/finished.webp",
        storageUrl: "https://example.com/finished.webp",
      }),
    ).toEqual({ completed: true, cleanupUrls: [] });

    const nextWorker = await t.mutation(
      internal.jobs.claimPostprocessingImages,
      {
        jobId,
        limit: 3,
      },
    );
    expect(nextWorker).toHaveLength(1);
    expect(firstWorker.map((image) => image._id)).not.toContain(
      nextWorker[0]!._id,
    );
    const images = await t.run((ctx) =>
      Promise.all(imageIds.map((imageId) => ctx.db.get(imageId))),
    );
    expect(
      images.filter((image) => image?.status === "generated"),
    ).toHaveLength(1);
    expect(
      images.filter(
        (image) =>
          image?.status === "postprocessing" && image.postProcessingStartedAt,
      ),
    ).toHaveLength(3);
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      completedTasks: 1,
      failedTasks: 0,
    });
  });

  test("reclaims interrupted workers only after expiry and fences their late success and failure", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const t = convexTest(schema, modules);
    const { jobId } = await seedPostprocessingJob(t);
    const interruptedWorker = await t.mutation(
      internal.jobs.claimPostprocessingImages,
      { jobId, limit: 3 },
    );
    expect(interruptedWorker).toHaveLength(3);

    now += LEASE_MS - 1;
    expect(
      await t.mutation(internal.jobs.claimPostprocessingImages, {
        jobId,
        limit: 3,
      }),
    ).toEqual([]);

    now += 1;
    const resumedWorker = await t.mutation(
      internal.jobs.claimPostprocessingImages,
      {
        jobId,
        limit: 3,
      },
    );
    expect(resumedWorker.map((image) => image._id)).toEqual(
      interruptedWorker.map((image) => image._id),
    );
    expect(
      resumedWorker.every((image) => image.postProcessingStartedAt === now),
    ).toBe(true);

    const imageId = resumedWorker[0]!._id;
    const oldLease = interruptedWorker[0]!.postProcessingStartedAt!;
    expect(
      await t.mutation(internal.jobs.completeImage, {
        imageId,
        expectedPostProcessingStartedAt: oldLease,
        generatedImageUrl: "https://example.com/stale.webp",
        storageUrl: "https://example.com/stale.webp",
      }),
    ).toEqual({ completed: false, cleanupUrls: [] });
    expect(
      await t.mutation(internal.jobs.failImage, {
        imageId,
        expectedPostProcessingStartedAt: oldLease,
        error: "Late failure from the interrupted worker",
      }),
    ).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(imageId))).toMatchObject({
      status: "postprocessing",
      postProcessingStartedAt: now,
      storageUrl: null,
    });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      completedTasks: 0,
      failedTasks: 0,
    });

    expect(
      await t.mutation(internal.jobs.completeImage, {
        imageId,
        expectedPostProcessingStartedAt:
          resumedWorker[0]!.postProcessingStartedAt!,
        generatedImageUrl: "https://example.com/resumed.webp",
        storageUrl: "https://example.com/resumed.webp",
      }),
    ).toEqual({ completed: true, cleanupUrls: [] });
    expect(await t.run((ctx) => ctx.db.get(imageId))).toMatchObject({
      status: "generated",
      postProcessingStartedAt: null,
      storageUrl: "https://example.com/resumed.webp",
    });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      completedTasks: 1,
      failedTasks: 0,
    });
  });
});
