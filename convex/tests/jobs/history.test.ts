/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

async function fixture(patch: Partial<Doc<"generationJobs">> = {}) {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead: 64 * 1024 } });
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "history.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    const otherShopId = await ctx.db.insert("shops", {
      domain: "other.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productId = await ctx.db.insert("products", {
      shopId, shopifyProductId: "p1", title: "Curtain", handle: "curtain",
      tags: [], collections: [], options: [], variants: [], metafields: [],
      currentShopifyImages: [], generationStatus: "ready", createdAt: 1, updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      shopId, status: "completed", mode: "bulk", executionMode: "realtime",
      imageProvider: "openai", productIds: [productId], selectedImageTypes: ["hero"],
      forceRegenerate: false, totalTasks: 900, completedTasks: 900, failedTasks: 0,
      generationCost: 45, inputTokens: 1000, outputTokens: 2000, pricedImageCount: 900,
      reviewTotal: 900, reviewPending: 900, reviewApproved: 0, reviewRejected: 0,
      createdAt: 1, updatedAt: 1, ...patch,
    });
    return { userId, shopId, otherShopId, productId, jobId };
  });
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids };
}

afterEach(() => vi.unstubAllEnvs());

describe("generation job history management", () => {
  test("archives and restores without changing execution, results or spend", async () => {
    const { t, client, userId, jobId } = await fixture();
    await client.mutation(api.jobs.setArchived, { jobId, archived: true });
    expect((await client.query(api.jobs.list, {})).page).toEqual([]);
    expect((await client.query(api.jobs.list, { archived: true })).page.map(job => job._id)).toEqual([jobId]);
    const archived = await t.run(ctx => ctx.db.get(jobId));
    expect(archived).toMatchObject({ archivedByUserId: userId, status: "completed", completedTasks: 900 });
    await client.mutation(api.jobs.setArchived, { jobId, archived: true });
    expect((await t.run(ctx => ctx.db.get(jobId)))?.archivedAt).toBe(archived?.archivedAt);
    expect(await client.query(api.jobs.get, { jobId })).not.toBeNull();
    expect((await client.query(api.jobs.costSummary, {})).totalCost).toBe(45);
    await client.mutation(api.jobs.setArchived, { jobId, archived: false });
    expect((await client.query(api.jobs.list, {})).page.map(job => job._id)).toEqual([jobId]);
    expect((await client.query(api.jobs.list, { archived: true })).page).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(jobId)))?.archivedByUserId).toBeUndefined();
  });

  test("removes a 900-image bulk from history under 64 KiB, retaining product images and costs", async () => {
    const { t, client, userId, jobId, shopId, productId } = await fixture({
      executionMode: "batch", openAiDurable: true,
    });
    await t.run(async ctx => {
      for (let i = 0; i < 9; i++) await ctx.db.insert("generationBatchSegments", {
        jobId, provider: "openai", status: "completed", phase: "completed",
        batchId: `batch_${i}`, batchStatus: "completed", imageCount: 100,
        createdAt: i, updatedAt: i,
      });
    });
    const imageIds: Id<"generatedImages">[] = [];
    for (let offset = 0; offset < 900; offset += 100) {
      imageIds.push(...await t.run(async ctx => {
        const ids = [];
        for (let i = 0; i < 100; i++) ids.push(await ctx.db.insert("generatedImages", {
          jobId, shopId, productId, imageType: "hero", promptUsed: "x".repeat(6500),
          status: "generated", storageUrl: "https://example.com/result.png",
          shopifyMediaId: "gid://shopify/MediaImage/1", createdAt: i, updatedAt: i,
        }));
        return ids;
      }));
    }
    await client.mutation(api.jobs.setArchived, { jobId, archived: true });
    await client.mutation(api.jobs.remove, { jobId });
    await client.mutation(api.jobs.remove, { jobId });
    expect((await client.query(api.jobs.list, {})).page).toEqual([]);
    expect((await client.query(api.jobs.list, { archived: true })).page).toEqual([]);
    expect(await client.query(api.jobs.get, { jobId })).toBeNull();
    const retained = await t.run(ctx => ctx.db.get(jobId));
    expect(retained?.deletedAt).toBeTypeOf("number");
    expect(retained?.deletedByUserId).toBe(userId);
    expect(await t.run(ctx => ctx.db.get(imageIds[0]))).toMatchObject({
      jobId, status: "generated", storageUrl: "https://example.com/result.png",
      shopifyMediaId: "gid://shopify/MediaImage/1",
    });
    expect(await t.run(ctx => ctx.db.get(imageIds[899]))).not.toBeNull();
    expect((await client.query(api.jobs.costSummary, {})).totalCost).toBe(45);
    await expect(client.mutation(api.jobs.setArchived, { jobId, archived: false })).rejects.toThrow("introuvable");
    await expect(client.mutation(api.jobs.retry, { jobId })).rejects.toThrow("Job not found");
    expect(await t.mutation(internal.jobs.markRunning, { jobId })).toBe(false);
    expect(await t.query(internal.jobs.nextQueuedImage, { jobId })).toBeNull();
  });

  test.each(["queued", "running"] as const)("allows archiving %s jobs but refuses removal", async status => {
    const { t, client, jobId } = await fixture({ status, completedTasks: 0 });
    await client.mutation(api.jobs.setArchived, { jobId, archived: true });
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("Terminez ou annulez");
    expect((await t.run(ctx => ctx.db.get(jobId)))?.status).toBe(status);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
  });

  test.each(["queued", "generating", "postprocessing"] as const)("refuses removal while an image is %s", async status => {
    const { t, client, jobId, productId } = await fixture({ status: "failed" });
    await t.run(ctx => ctx.db.insert("generatedImages", {
      jobId, productId, imageType: "hero", promptUsed: "test", status, createdAt: 1, updatedAt: 1,
    }));
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("encore en cours");
    expect((await t.run(ctx => ctx.db.get(jobId)))?.deletedAt).toBeUndefined();
  });

  test.each([
    { status: "submitting", phase: "uncertain", submissionAttemptedAt: 1 },
    { status: "running", phase: "waiting", batchId: "batch_1" },
    { status: "failed", phase: "failed", submissionAttemptedAt: 1 },
    { status: "cancelled", phase: "failed", batchId: "batch_1", cancellationPending: true },
    { status: "cancelled", phase: "failed", batchId: "batch_1", submissionAttemptedAt: 1 },
    { status: "failed" }, // legacy lost receipt
    { status: "cancelled", batchId: "batch_1", batchStatus: "cancelling" },
    { status: "failed", batchId: "batch_1", batchStatus: "unknown_state" },
    { status: "failed", batchId: "batch_1" },
  ] satisfies Array<Partial<Doc<"generationBatchSegments">>>)("retains jobs with unresolved provider work: %j", async segment => {
    const { t, client, jobId } = await fixture({ status: "failed", executionMode: "batch", openAiDurable: true });
    await t.run(ctx => ctx.db.insert("generationBatchSegments", {
      jobId, provider: "openai", imageCount: 100, createdAt: 1, updatedAt: 1, ...segment,
    }));
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("incertaine");
    await client.mutation(api.jobs.setArchived, { jobId, archived: true });
    expect((await client.query(api.jobs.list, { archived: true })).page).toHaveLength(1);
  });

  test.each(["openai", "gemini"] as const)("removes resolved %s batches while retaining receipts", async provider => {
    const { t, client, jobId } = await fixture({ executionMode: "batch", imageProvider: provider });
    const segmentId = await t.run(ctx => ctx.db.insert("generationBatchSegments", {
      jobId, provider, status: "completed", batchId: "batch_1", imageCount: 900,
      batchStatus: provider === "openai" ? "completed" : "JOB_STATE_SUCCEEDED", createdAt: 1, updatedAt: 1,
    }));
    await client.mutation(api.jobs.remove, { jobId });
    expect((await t.run(ctx => ctx.db.get(segmentId)))?.batchId).toBe("batch_1");
  });

  test("allows resolved cancellation and explicit submission rejection", async () => {
    const { t, client, jobId } = await fixture({ status: "cancelled", executionMode: "batch", openAiDurable: true });
    await t.run(async ctx => {
      await ctx.db.insert("generationBatchSegments", {
        jobId, provider: "openai", status: "cancelled", phase: "failed", batchId: "batch_1",
        submissionAttemptedAt: 1, cancellationReconciled: true, batchStatus: "cancelled",
        imageCount: 100, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("generationBatchSegments", {
        jobId, provider: "openai", status: "failed", phase: "failed", submissionAttemptedAt: 1,
        submissionRejected: true, imageCount: 100, createdAt: 1, updatedAt: 1,
      });
    });
    await client.mutation(api.jobs.remove, { jobId });
  });

  test("refuses uncertain legacy job submission or a still active legacy batch", async () => {
    const { t, client, jobId } = await fixture({ status: "failed", executionMode: "batch" });
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("reste à confirmer");
    await t.run(ctx => ctx.db.patch(jobId, { batchId: "batch_1", batchStatus: "in_progress" }));
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("reste à confirmer");
    await t.run(ctx => ctx.db.patch(jobId, { batchStatus: "failed" }));
    await client.mutation(api.jobs.remove, { jobId });
  });

  test("requires approval and the active shop for both operations, including idempotent removal", async () => {
    const { t, client, jobId, otherShopId, userId } = await fixture();
    await expect(t.mutation(api.jobs.setArchived, { jobId, archived: true })).rejects.toThrow("Authentication required");
    await expect(t.mutation(api.jobs.remove, { jobId })).rejects.toThrow("Authentication required");
    await t.run(ctx => ctx.db.patch(userId, { approvalStatus: "pending" }));
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("admin approval");
    await t.run(ctx => ctx.db.patch(userId, { approvalStatus: "approved" }));
    await client.mutation(api.jobs.remove, { jobId });
    await t.run(ctx => ctx.db.patch(userId, { activeShopId: otherShopId }));
    await expect(client.mutation(api.jobs.setArchived, { jobId, archived: true })).rejects.toThrow("introuvable");
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("introuvable");
  });

  test("does not expose internal retry jobs through archives", async () => {
    const { client, jobId } = await fixture({ isHidden: true });
    await expect(client.mutation(api.jobs.setArchived, { jobId, archived: true })).rejects.toThrow("introuvable");
    await expect(client.mutation(api.jobs.remove, { jobId })).rejects.toThrow("introuvable");
    expect((await client.query(api.jobs.list, { archived: true })).page).toEqual([]);
  });
});
