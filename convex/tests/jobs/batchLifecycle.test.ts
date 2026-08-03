/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

type ImageStatus = Doc<"generatedImages">["status"];

async function seedBatchJob(
  t: ReturnType<typeof convexTest>,
  options: {
    status: Doc<"generationJobs">["status"];
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    imageStatuses?: ImageStatus[];
    batchStatus?: string;
  },
) {
  return await t.run(async (ctx) => {
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
      generationStatus: "pushed",
      createdAt: 1,
      updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      status: options.status,
      mode: "single",
      executionMode: "batch",
      batchId: "batches/test",
      batchStatus: options.batchStatus ?? "BATCH_STATE_SUCCEEDED",
      imageProvider: "gemini",
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      forceRegenerate: false,
      totalTasks: options.totalTasks,
      completedTasks: options.completedTasks,
      failedTasks: options.failedTasks,
      error: options.failedTasks > 0 ? "Previous failure." : null,
      createdAt: 1,
      updatedAt: 1,
      ...(options.status === "completed" || options.status === "failed"
        ? { completedAt: 2 }
        : {}),
    });
    const imageIds = [];
    for (const [index, status] of (options.imageStatuses ?? []).entries()) {
      imageIds.push(
        await ctx.db.insert("generatedImages", {
          productId,
          jobId,
          imageType: `Hero ${index + 1}`,
          promptUsed: "Prompt",
          generatedImageUrl:
            status === "generated" || status === "uploaded"
              ? `https://example.com/${index}.webp`
              : null,
          storageUrl:
            status === "generated" || status === "uploaded"
              ? `https://example.com/${index}.webp`
              : null,
          status,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { jobId, imageIds };
  });
}

describe("batch job lifecycle", () => {
  test("does not reopen a completed job when an output image is deleted", async () => {
    const t = convexTest(schema, modules);
    const { jobId, imageIds } = await seedBatchJob(t, {
      status: "completed",
      totalTasks: 1,
      completedTasks: 1,
      failedTasks: 0,
      imageStatuses: ["uploaded"],
    });

    await t.mutation(internal.shopify.deleteImageRecord, {
      imageId: imageIds[0]!,
    });

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({
      status: "completed",
      completedTasks: 1,
      failedTasks: 0,
      completedAt: 2,
    });
  });

  test("repairs a successful batch whose retained image rows are gone", async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await seedBatchJob(t, {
      status: "running",
      totalTasks: 5,
      completedTasks: 0,
      failedTasks: 0,
    });

    const finished = await t.mutation(
      internal.jobs.finishSuccessfulBatchIfIdle,
      { jobId },
    );

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(finished).toBe(true);
    expect(job).toMatchObject({
      status: "completed",
      completedTasks: 5,
      failedTasks: 0,
      error: null,
    });
    expect(job?.completedAt).toBeTypeOf("number");
  });

  test("keeps a successful batch running while image work is active", async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await seedBatchJob(t, {
      status: "running",
      totalTasks: 1,
      completedTasks: 0,
      failedTasks: 0,
      imageStatuses: ["postprocessing"],
    });

    const finished = await t.mutation(
      internal.jobs.finishSuccessfulBatchIfIdle,
      { jobId },
    );

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(finished).toBe(false);
    expect(job).toMatchObject({
      status: "running",
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test("preserves observed failures while reconciling deleted successful rows", async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await seedBatchJob(t, {
      status: "running",
      totalTasks: 3,
      completedTasks: 1,
      failedTasks: 1,
      imageStatuses: ["uploaded", "failed"],
    });

    const finished = await t.mutation(
      internal.jobs.finishSuccessfulBatchIfIdle,
      { jobId },
    );

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(finished).toBe(true);
    expect(job).toMatchObject({
      status: "failed",
      completedTasks: 2,
      failedTasks: 1,
      error: "1 image task(s) failed.",
    });
  });

  test("skips unchanged provider batch status writes", async () => {
    const t = convexTest(schema, modules);
    const { jobId } = await seedBatchJob(t, {
      status: "running",
      totalTasks: 1,
      completedTasks: 0,
      failedTasks: 0,
    });

    const changed = await t.mutation(internal.jobs.setBatchStatus, {
      jobId,
      batchStatus: "BATCH_STATE_SUCCEEDED",
    });

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(changed).toBe(false);
    expect(job?.updatedAt).toBe(1);
  });
});
