// @vitest-environment node
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { submitGeminiBatch } from "../../generation/geminiBatchClient";
import { submitOpenAiBatch } from "../../generation/openAiBatch";

vi.mock("../../generation/geminiBatchClient", () => ({
  submitGeminiBatch: vi.fn(),
}));
vi.mock("../../generation/openAiBatch", () => ({
  submitOpenAiBatch: vi.fn(),
}));
const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(submitGeminiBatch).mockImplementation(async () => ({
    batchId: `batches/${vi.mocked(submitGeminiBatch).mock.calls.length}`,
    inputFileName: "files/input", batchStatus: "PENDING",
  }));
  vi.mocked(submitOpenAiBatch).mockImplementation(async () => ({
    batchId: `batch_${vi.mocked(submitOpenAiBatch).mock.calls.length}`,
    batchStatus: "validating",
  }));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function seed(t: ReturnType<typeof convexTest>, provider: "gemini" | "openai", count: number) {
  return t.run(async (ctx) => {
    const productId = await ctx.db.insert("products", {
      shopifyProductId: "gid://shopify/Product/1", title: "Curtain", handle: "curtain",
      tags: [], collections: [], options: [], variants: [], metafields: [],
      currentShopifyImages: [], generationStatus: "pushed", createdAt: 1, updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      status: "queued", mode: "single", executionMode: "batch", imageProvider: provider,
      vibeAnalysis: false, productIds: [productId], selectedImageTypes: ["Hero"],
      forceRegenerate: false, totalTasks: count, completedTasks: 0, failedTasks: 0,
      createdAt: 1, updatedAt: 1,
    });
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("generatedImages", {
        jobId, productId, imageType: "Hero", promptUsed: "Prompt", imageProvider: provider,
        sourceImageUrl: "https://example.com/reference.jpg", status: "queued", createdAt: 1, updatedAt: 1,
      });
    }
    return jobId;
  });
}

test("submits a large Gemini job in bounded waves without resubmitting images", async () => {
  const t = convexTest(schema, modules);
  const jobId = await seed(t, "gemini", 65);
  const submit = vi.mocked(submitGeminiBatch);
  await t.action(internal.generation.submitBatch, { jobId });
  expect(submit).toHaveBeenCalledTimes(3);
  let job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.allBatchesSubmittedAt).toBeUndefined();
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled.some((fn) => fn.name.includes("submitBatch") && fn.args[0]?.jobId === jobId)).toBe(true);

  await t.action(internal.generation.submitBatch, { jobId });
  await t.action(internal.generation.submitBatch, { jobId });
  expect(submit).toHaveBeenCalledTimes(7);
  const ids = submit.mock.calls.flatMap(([args]) => args.images.map((image) => image._id));
  expect(ids).toHaveLength(65);
  expect(new Set(ids).size).toBe(65);
  expect(submit.mock.calls.every(([args]) => args.images.length <= 10)).toBe(true);
  job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.allBatchesSubmittedAt).toBeTypeOf("number");
  await t.action(internal.generation.submitBatch, { jobId });
  expect(submit).toHaveBeenCalledTimes(7);
});

test("delegates a new OpenAI bulk to durable segments without calling the legacy paid submission", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const jobId = await seed(t, "openai", 201);
  await t.action(internal.generation.submitBatch, { jobId });
  await t.action(internal.generation.submitBatch, { jobId });
  expect(submitOpenAiBatch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
    status: "running", openAiDurable: true, openAiBatchSize: 100, openAiBatchConcurrency: 2,
  });
  const segments = await t.run((ctx) => ctx.db.query("generationBatchSegments")
    .withIndex("by_job", (q) => q.eq("jobId", jobId)).collect());
  expect(segments).toHaveLength(2);
  expect(segments.every((segment) => segment.phase === "preparing" && segment.imageCount === 100)).toBe(true);
  const images = await t.run((ctx) => ctx.db.query("generatedImages")
    .withIndex("by_job", (q) => q.eq("jobId", jobId)).collect());
  expect(images.filter((image) => image.batchSegmentId)).toHaveLength(200);
  expect(images.every((image) => image.status === "queued")).toBe(true);
});

test("a failed segment does not prevent submission of later waves", async () => {
  const t = convexTest(schema, modules);
  const jobId = await seed(t, "gemini", 35);
  vi.mocked(submitGeminiBatch).mockRejectedValueOnce(new Error("Submission timed out"));
  await t.action(internal.generation.submitBatch, { jobId });
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.failedTasks).toBe(10);
  await t.action(internal.generation.submitBatch, { jobId });
  expect(submitGeminiBatch).toHaveBeenCalledTimes(4);
  expect((await t.run((ctx) => ctx.db.get(jobId)))?.allBatchesSubmittedAt).toBeTypeOf("number");
});
