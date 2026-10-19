// @vitest-environment node
/// <reference types="vite/client" />

import workflowTest from "@convex-dev/workflow/test";
import { getStatus, type WorkflowId } from "@convex-dev/workflow";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import {
  createOpenAiBatchFromFile,
  findOpenAiBatchBySubmissionKey,
  getOpenAiBatchState,
  ingestOpenAiBatchFilePage,
  prepareOpenAiBatchReferences,
  uploadOpenAiBatchInput,
  OpenAiBatchRejectedError,
} from "../../generation/openAiDurableClient";
import { uploadToR2 } from "../../generation/storage";
import { cancelOpenAiBatch } from "../../generation/openAiBatch";

vi.mock("../../generation/openAiDurableClient", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../generation/openAiDurableClient")
  >()),
  prepareOpenAiBatchReferences: vi.fn(),
  uploadOpenAiBatchInput: vi.fn(),
  createOpenAiBatchFromFile: vi.fn(),
  findOpenAiBatchBySubmissionKey: vi.fn(),
  getOpenAiBatchState: vi.fn(),
  ingestOpenAiBatchFilePage: vi.fn(),
}));
vi.mock("../../generation/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generation/storage")>()),
  uploadToR2: vi.fn(),
}));
vi.mock("../../generation/openAiBatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generation/openAiBatch")>()),
  cleanupOpenAiBatchReferencesForImage: vi.fn(),
  cancelOpenAiBatch: vi.fn(),
}));

const postprocessWithoutExternalIo = internalAction({
  args: { jobId: v.id("generationJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const images: Doc<"generatedImages">[] = await ctx.runQuery(
      internal.jobs.imagesForJob,
      args,
    );
    for (const image of images) {
      if (image.status !== "postprocessing") continue;
      await ctx.runMutation(internal.jobs.completeImage, {
        imageId: image._id,
        storageUrl: image.postProcessingInputUrl!,
        generatedImageUrl: image.postProcessingInputUrl!,
        providerBatchId: image.providerBatchId,
      });
    }
    return null;
  },
});
const modules = {
  ...import.meta.glob("../../**/*.ts"),
  "../../generation.ts": async () => ({
    ...(await import("../../generation")),
    processPostprocessingJob: postprocessWithoutExternalIo,
  }),
};
type TestBackend = ReturnType<typeof convexTest<typeof schema.tables>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(prepareOpenAiBatchReferences).mockImplementation(async (args) => {
    const references = args.sourceUrls.map((sourceUrl) => ({
      sourceUrl,
      url: `https://r2.example.com/staged/${encodeURIComponent(sourceUrl)}`,
    }));
    for (const reference of references) await args.onPrepared?.(reference);
    return references;
  });
  vi.mocked(uploadOpenAiBatchInput).mockResolvedValue({
    inputFileId: "input-file",
  });
  vi.mocked(createOpenAiBatchFromFile).mockResolvedValue({
    batchId: "accepted-batch",
    batchStatus: "validating",
  });
  vi.mocked(findOpenAiBatchBySubmissionKey).mockResolvedValue({
    matches: [],
    cursor: null,
    exhausted: true,
  });
  vi.mocked(getOpenAiBatchState).mockResolvedValue({
    batchStatus: "completed",
    inputFileId: "input-file",
    metadata: {},
    outputFileId: "output-file",
    errorFileId: null,
    error: null,
  });
  vi.mocked(uploadToR2).mockImplementation(
    async ({ key }) => `https://r2.example.com/${key}`,
  );
  vi.mocked(cancelOpenAiBatch).mockResolvedValue("cancelling");
  // A stray HTTP call is a test failure, including a provider call from a timer.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected external HTTP call");
    }),
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function fixture(productCount = 1, imagesPerProduct = 3) {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "durable.myshopify.com",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productIds: Id<"products">[] = [];
    for (let index = 0; index < productCount; index++)
      productIds.push(
        await ctx.db.insert("products", {
          shopId,
          shopifyProductId: `gid://shopify/Product/${index}`,
          title: `Product ${index}`,
          handle: `product-${index}`,
          tags: [],
          collections: [],
          options: [],
          variants: [],
          metafields: [],
          currentShopifyImages: [],
          generationStatus: "generating",
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    const jobId = await ctx.db.insert("generationJobs", {
      shopId,
      status: "queued",
      mode: "bulk",
      executionMode: "batch",
      imageProvider: "openai",
      imageModel: "gpt-image-2.5-sunburst",
      vibeAnalysis: false,
      productIds,
      selectedImageTypes: ["Hero", "Detail", "Lifestyle"],
      forceRegenerate: false,
      totalTasks: productCount * imagesPerProduct,
      completedTasks: 0,
      failedTasks: 0,
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageIds: Id<"generatedImages">[] = [];
    for (const [index, productId] of productIds.entries()) {
      for (let type = 0; type < imagesPerProduct; type++)
        imageIds.push(
          await ctx.db.insert("generatedImages", {
            shopId,
            jobId,
            productId,
            imageType: `type-${type}`,
            promptUsed: "Prompt",
            imageProvider: "openai",
            sourceImageUrl: `https://example.com/product-${index}.jpg`,
            batchSegmentId: null,
            status: "queued",
            createdAt: 1,
            updatedAt: 1,
          }),
        );
    }
    return { userId, shopId, productIds, jobId, imageIds };
  });
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids };
}

function segmentsForJob(t: TestBackend, jobId: Id<"generationJobs">) {
  return t.run((ctx) =>
    ctx.db
      .query("generationBatchSegments")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect(),
  );
}

async function initialize(
  t: TestBackend,
  jobId: Id<"generationJobs">,
  batchSize = 100,
  concurrency = 2,
) {
  await t.mutation(internal.openAiDurable.initialize, {
    jobId,
    batchSize,
    concurrency,
  });
  return segmentsForJob(t, jobId);
}

async function putSegmentInPhase(
  t: TestBackend,
  segmentId: Id<"generationBatchSegments">,
  phase: NonNullable<Doc<"generationBatchSegments">["phase"]>,
  patch: Partial<Doc<"generationBatchSegments">> = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(segmentId, { phase, ...patch });
    const segment = await ctx.db.get(segmentId);
    if (segment?.batchId) {
      const images = await ctx.db
        .query("generatedImages")
        .withIndex("by_batch_segment", (q) => q.eq("batchSegmentId", segmentId))
        .collect();
      for (const image of images)
        await ctx.db.patch(image._id, {
          status: "generating",
          providerBatchId: segment.batchId,
        });
    }
  });
}

async function preparedUncertainFixture(taskCount = 3) {
  vi.setSystemTime(4_000_000);
  const data = await fixture(1, taskCount + 2);
  const [segment] = await initialize(data.t, data.jobId, taskCount, 1);
  const submissionAttemptedAt = Date.now() - 31 * 60_000;
  await putSegmentInPhase(data.t, segment._id, "uncertain", {
    inputFileName: "uncertain-input",
    submissionAttemptedAt,
    preparedTasks: taskCount,
    error: "Submission uncertain: creation connection reset",
  });
  await data.t.run(async (ctx) => {
    for (const imageId of data.imageIds.slice(0, taskCount))
      await ctx.db.patch(imageId, {
        openAiPrepared: true,
        stagedReferenceUrls: ["https://r2.example.com/prepared-reference.jpg"],
      });
    await ctx.db.patch(data.imageIds[taskCount], {
      status: "generated",
      storageUrl: "https://r2.example.com/kept.png",
    });
    await ctx.db.patch(data.imageIds[taskCount + 1], {
      status: "uploaded",
      storageUrl: "https://r2.example.com/published.png",
      shopifyMediaId: "media-kept",
    });
    await ctx.db.patch(data.jobId, { completedTasks: 2 });
  });
  return {
    ...data,
    segment,
    recoveryArgs: {
      segmentId: segment._id,
      expectedSubmissionKey: segment.submissionKey!,
      expectedInputFileId: "uncertain-input",
      expectedAttemptedAt: submissionAttemptedAt,
      confirmResubmission: true as const,
    },
  };
}

async function copyQueuedJob(
  t: TestBackend,
  jobId: Id<"generationJobs">,
  imageIds: Id<"generatedImages">[],
) {
  return t.run(async (ctx) => {
    const job = (await ctx.db.get(jobId))!;
    const { _id, _creationTime, ...jobFields } = job;
    void _id;
    void _creationTime;
    const copiedJobId = await ctx.db.insert("generationJobs", {
      ...jobFields,
      status: "queued",
      totalTasks: imageIds.length,
      completedTasks: 0,
      failedTasks: 0,
    });
    for (const imageId of imageIds) {
      const image = (await ctx.db.get(imageId))!;
      const { _id, _creationTime, ...imageFields } = image;
      void _id;
      void _creationTime;
      await ctx.db.insert("generatedImages", {
        ...imageFields,
        jobId: copiedJobId,
        batchSegmentId: null,
        status: "queued",
      });
    }
    return copiedJobId;
  });
}

describe("durable OpenAI batch orchestration", () => {
  test("an uncertain segment reserves one slot while independent jobs use the remaining capacity", async () => {
    const { t, jobId, imageIds } = await fixture();
    const [uncertain] = await initialize(t, jobId, 3, 2);
    await putSegmentInPhase(t, uncertain._id, "uncertain", {
      inputFileName: "uncertain-input",
      submissionAttemptedAt: Date.now() - 1,
    });
    const secondJobId = await copyQueuedJob(t, jobId, imageIds);
    expect(await initialize(t, secondJobId, 3, 2)).toHaveLength(1);
    const thirdJobId = await copyQueuedJob(t, jobId, imageIds);
    expect(await initialize(t, thirdJobId, 3, 2)).toHaveLength(0);
    const active = await t.run((ctx) =>
      ctx.db.query("generationBatchSegments").collect(),
    );
    expect(active.filter((s) => s.status === "submitting" || s.status === "running")).toHaveLength(2);
    expect(await t.run((ctx) => ctx.db.get(uncertain._id))).toMatchObject({
      phase: "uncertain",
      status: "submitting",
    });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("an uncertain segment does not block unrelated queued tasks in the same job", async () => {
    const { t, jobId } = await fixture(1, 6);
    const [uncertain] = await initialize(t, jobId, 3, 1);
    await putSegmentInPhase(t, uncertain._id, "uncertain", {
      inputFileName: "uncertain-input",
      submissionAttemptedAt: Date.now() - 1,
    });
    await t.run((ctx) => ctx.db.patch(jobId, { openAiBatchConcurrency: 2 }));
    const segments = await initialize(t, jobId);
    expect(segments).toHaveLength(2);
    expect(segments.find((s) => s._id === uncertain._id)?.phase).toBe("uncertain");
    expect(segments.find((s) => s._id !== uncertain._id)?.imageCount).toBe(3);
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("empty reconciliation preserves the original submission failure without submitting again", async () => {
    const { t, segment } = await preparedUncertainFixture();
    for (let index = 0; index < 3; index++)
      await t.action(internal.openAiDurableActions.advance, { segmentId: segment._id });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "uncertain",
      error: "Submission uncertain: creation connection reset",
    });
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenCalledTimes(3);
    expect(vi.mocked(findOpenAiBatchBySubmissionKey).mock.calls[0][0]).not.toHaveProperty("inputFileId");
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("operator recovery replaces only the verified absent attempt and keeps prepared tasks and paid results", async () => {
    const { t, jobId, imageIds, segment, recoveryArgs } = await preparedUncertainFixture(100);
    vi.mocked(findOpenAiBatchBySubmissionKey)
      .mockResolvedValueOnce({ matches: [], cursor: "page-two", exhausted: false })
      .mockResolvedValueOnce({ matches: [], cursor: null, exhausted: true });
    const result = await t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs);
    expect(result.retiredSegmentId).toBe(segment._id);
    expect(result.replacementSegmentId).not.toBe(segment._id);
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenNthCalledWith(1, expect.objectContaining({
      submissionKey: recoveryArgs.expectedSubmissionKey,
      inputFileId: recoveryArgs.expectedInputFileId,
    }));
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "page-two" }));
    const old = (await t.run((ctx) => ctx.db.get(segment._id)))!;
    expect(old).toMatchObject({
      status: "cancelled",
      phase: "failed",
      submissionKey: recoveryArgs.expectedSubmissionKey,
      inputFileName: recoveryArgs.expectedInputFileId,
      submissionAttemptedAt: recoveryArgs.expectedAttemptedAt,
      cancellationPending: false,
      cancellationReconciled: true,
    });
    expect(old.error).toMatch(/operator|opérateur/i);
    expect(old.submissionRejected).toBeUndefined();
    expect(old.submissionRecovery).toEqual({
      checkedAt: Date.now(),
      replacementSegmentId: result.replacementSegmentId,
    });
    const replacement = (await t.run((ctx) => ctx.db.get(result.replacementSegmentId)))!;
    expect(replacement).toMatchObject({
      jobId,
      status: "submitting",
      phase: "submitting",
      inputFileName: recoveryArgs.expectedInputFileId,
      imageCount: 100,
      preparedTasks: 100,
    });
    expect(replacement.submissionKey).not.toBe(old.submissionKey);
    expect(replacement.submissionAttemptedAt).toBeUndefined();
    const images = await t.run((ctx) => Promise.all(imageIds.map((id) => ctx.db.get(id))));
    for (const image of images.slice(0, 100))
      expect(image).toMatchObject({
        status: "queued",
        batchSegmentId: replacement._id,
        openAiPrepared: true,
        stagedReferenceUrls: ["https://r2.example.com/prepared-reference.jpg"],
      });
    expect(images[100]).toMatchObject({ status: "generated", storageUrl: "https://r2.example.com/kept.png" });
    expect(images[101]).toMatchObject({ status: "uploaded", shopifyMediaId: "media-kept" });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ completedTasks: 2, failedTasks: 0 });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    expect(uploadOpenAiBatchInput).not.toHaveBeenCalled();
    await t.action(internal.openAiDurableActions.advance, { segmentId: old._id });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    await t.action(internal.openAiDurableActions.advance, { segmentId: replacement._id });
    expect(createOpenAiBatchFromFile).toHaveBeenCalledOnce();
    expect(createOpenAiBatchFromFile).toHaveBeenCalledWith(expect.objectContaining({
      inputFileId: "uncertain-input", submissionKey: replacement.submissionKey,
    }));
    await expect(t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs)).rejects.toThrow();
    expect(createOpenAiBatchFromFile).toHaveBeenCalledOnce();
  });

  test.each(["key-match", "file-match", "ambiguous", "incomplete", "provider-error"])(
    "operator recovery refuses unsafe provider evidence (%s)",
    async (reason) => {
      const { t, jobId, imageIds, segment, recoveryArgs } = await preparedUncertainFixture();
      if (reason === "provider-error")
        vi.mocked(findOpenAiBatchBySubmissionKey).mockRejectedValue(new Error("OpenAI listing unavailable"));
      else if (reason === "incomplete") {
        let page = 0;
        vi.mocked(findOpenAiBatchBySubmissionKey).mockImplementation(async () => ({
          matches: [], cursor: `more-pages-${++page}`, exhausted: false,
        }));
      }
      else
        vi.mocked(findOpenAiBatchBySubmissionKey).mockResolvedValue({
          matches: [{ batchId: "existing-paid-batch", batchStatus: "validating", inputFileId: reason === "key-match" ? "other-input" : "uncertain-input" },
            ...(reason === "ambiguous" ? [{ batchId: "another-paid-batch", batchStatus: "in_progress", inputFileId: "uncertain-input" }] : [])],
          cursor: null,
          exhausted: true,
        });
      await expect(t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs)).rejects.toThrow();
      if (reason === "incomplete") expect(findOpenAiBatchBySubmissionKey).toHaveBeenCalledTimes(20);
      expect(await segmentsForJob(t, jobId)).toHaveLength(1);
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({ phase: "uncertain", status: "submitting" });
      for (const imageId of imageIds.slice(0, 3))
        expect(await t.run((ctx) => ctx.db.get(imageId))).toMatchObject({ batchSegmentId: segment._id });
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test("operator recovery refuses segments larger than the supported 100-task limit", async () => {
    const { t, jobId, imageIds, segment, recoveryArgs } = await preparedUncertainFixture(100);
    await t.run(async (ctx) => {
      await ctx.db.patch(imageIds[100], {
        status: "queued",
        batchSegmentId: segment._id,
        storageUrl: undefined,
        openAiPrepared: true,
      });
      await ctx.db.patch(segment._id, { imageCount: 101, preparedTasks: 101 });
    });
    await expect(t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs)).rejects.toThrow();
    expect(await segmentsForJob(t, jobId)).toHaveLength(1);
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test.each(["identity", "recent", "active-lease"])(
    "operator recovery refuses before provider scanning when its target is unsafe (%s)",
    async (reason) => {
      const { t, jobId, segment, recoveryArgs } = await preparedUncertainFixture();
      if (reason === "identity") recoveryArgs.expectedInputFileId = "wrong-input";
      if (reason === "recent") {
        recoveryArgs.expectedAttemptedAt = Date.now() - 5 * 60_000;
        await t.run((ctx) => ctx.db.patch(segment._id, { submissionAttemptedAt: recoveryArgs.expectedAttemptedAt }));
      }
      if (reason === "active-lease")
        await t.run((ctx) => ctx.db.patch(segment._id, { leaseToken: "current-worker", leaseUntil: Date.now() + 60_000 }));
      await expect(t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs)).rejects.toThrow();
      expect(findOpenAiBatchBySubmissionKey).not.toHaveBeenCalled();
      expect(await segmentsForJob(t, jobId)).toHaveLength(1);
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test.each(["generated", "provider-receipt", "storage-result", "generated-result", "unprepared"])(
    "operator recovery rejects tasks changed during provider verification (%s)",
    async (reason) => {
      const { t, jobId, imageIds, segment, recoveryArgs } = await preparedUncertainFixture();
      vi.mocked(findOpenAiBatchBySubmissionKey).mockImplementationOnce(async () => {
        await t.run((ctx) => ctx.db.patch(imageIds[0],
          reason === "generated" ? { status: "generated" } :
            reason === "provider-receipt" ? { providerBatchId: "paid-batch" } :
              reason === "storage-result" ? { storageUrl: "https://r2.example.com/paid.png" } :
                reason === "generated-result" ? { generatedImageUrl: "https://r2.example.com/paid.png" } :
                  { openAiPrepared: false },
        ));
        return { matches: [], cursor: null, exhausted: true };
      });
      await expect(t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs)).rejects.toThrow();
      expect(await segmentsForJob(t, jobId)).toHaveLength(1);
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({ phase: "uncertain" });
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test.each(["stale-token", "expired-lease", "old-evidence", "future-evidence", "late-receipt"])(
    "atomic recovery refuses stale evidence or concurrent provider acceptance (%s)",
    async (reason) => {
      const { t, jobId, segment, recoveryArgs } = await preparedUncertainFixture();
      await t.mutation(internal.openAiDurable.claim, { segmentId: segment._id, token: "operator-lease" });
      if (reason === "expired-lease")
        await t.run((ctx) => ctx.db.patch(segment._id, { leaseUntil: Date.now() }));
      if (reason === "late-receipt")
        await t.mutation(internal.openAiDurable.saveReceipt, {
          segmentId: segment._id,
          submissionKey: recoveryArgs.expectedSubmissionKey,
          inputFileId: recoveryArgs.expectedInputFileId,
          batchId: "accepted-during-verification",
        });
      await expect(t.mutation(internal.openAiDurable.replaceUnacceptedSegment, {
        segmentId: recoveryArgs.segmentId,
        expectedSubmissionKey: recoveryArgs.expectedSubmissionKey,
        expectedInputFileId: recoveryArgs.expectedInputFileId,
        expectedAttemptedAt: recoveryArgs.expectedAttemptedAt,
        token: reason === "stale-token" ? "obsolete-operator" : "operator-lease",
        verifiedAbsentAt: Date.now() + (reason === "old-evidence" ? -60_001 : reason === "future-evidence" ? 1 : 0),
      })).rejects.toThrow();
      expect(await segmentsForJob(t, jobId)).toHaveLength(1);
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({ phase: "uncertain" });
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test("a resolved operator attempt does not block retries after the replacement receives a definite rejection", async () => {
    const { t, client, jobId, recoveryArgs } = await preparedUncertainFixture();
    const { replacementSegmentId } = await t.action(internal.openAiDurableActions.recoverUncertainSubmission, recoveryArgs);
    vi.mocked(createOpenAiBatchFromFile).mockRejectedValueOnce(new OpenAiBatchRejectedError("OpenAI rejected replacement (400)"));
    await t.action(internal.openAiDurableActions.advance, { segmentId: replacementSegmentId });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ status: "failed", completedTasks: 2, failedTasks: 3 });
    await expect(client.mutation(api.jobs.retry, { jobId })).resolves.toBeNull();
    expect(createOpenAiBatchFromFile).toHaveBeenCalledOnce();
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ completedTasks: 2, failedTasks: 0 });
  });

  test("the authenticated public entry creates one 300-product bulk with 900 tasks and a transactional initializer", async () => {
    const {
      t,
      client,
      shopId,
      jobId: seededJob,
      productIds,
      imageIds,
    } = await fixture(300, 3);
    await t.run(async (ctx) => {
      for (const id of imageIds) await ctx.db.delete(id);
      await ctx.db.delete(seededJob);
      for (const [index, id] of productIds.entries())
        await ctx.db.patch(id, {
          featuredImageUrl: `https://example.com/product-${index}.jpg`,
          generationStatus: "not_started",
        });
      for (const [key, value] of Object.entries({
        IMAGE_PROVIDER: "openai",
        GENERATION_EXECUTION_MODE: "batch",
        OPENAI_IMAGE_MODEL: "gpt-image-2.5-sunburst",
      })) {
        await ctx.db.insert("appSettings", {
          shopId,
          key,
          value,
          updatedAt: 1,
        });
      }
    });
    for (const imageType of ["Hero", "Detail", "Lifestyle"])
      await client.mutation(api.prompts.create, {
        imageType,
        label: imageType,
        content: `Render {{PRODUCT_TITLE}} ${imageType}`,
        promptKind: "product_only",
        referenceImageCount: 1,
      });
    const jobId = await client.mutation(api.jobs.create, {
      productIds,
      selectedImageTypes: ["Hero", "Detail", "Lifestyle"],
      forceRegenerate: false,
      useVibeAnalysis: false,
    });
    const result = await client.query(api.jobs.get, { jobId });
    expect(result?.job).toMatchObject({
      mode: "bulk",
      totalTasks: 900,
      imageModel: "gpt-image-2.5-sunburst",
    });
    expect(result?.products).toHaveLength(300);
    expect(result?.images).toHaveLength(900);
    expect(new Set(result?.images.map((image) => image.jobId)).size).toBe(1);
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.some(
        (s) =>
          s.name === "openAiDurable:initialize" && s.args[0]?.jobId === jobId,
      ),
    ).toBe(true);
    await t.mutation(internal.openAiDurable.resumeStarts, {});
    expect(await segmentsForJob(t, jobId)).toHaveLength(2);
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("the registered workflow automatically executes every phase and finishes without external IO", async () => {
    const { t, jobId, imageIds } = await fixture();
    const [segment] = await initialize(t, jobId);
    vi.mocked(getOpenAiBatchState).mockResolvedValue({
      batchStatus: "completed",
      inputFileId: "input-file",
      metadata: { submission_key: segment.submissionKey! },
      outputFileId: "output-file",
      errorFileId: null,
      error: null,
    });
    vi.mocked(ingestOpenAiBatchFilePage).mockImplementation(async (args) => {
      const start = args.byteOffset / 100;
      const page = imageIds.slice(start, start + 2);
      for (const [index, imageId] of page.entries()) {
        await args.onItem(
          imageId,
          { bytes: Buffer.from("image"), contentType: "image/png" },
          (start + index + 1) * 100,
        );
      }
      return {
        byteOffset: (start + page.length) * 100,
        done: start + page.length === imageIds.length,
        processed: page.length,
      };
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers, 200);
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
    expect(uploadOpenAiBatchInput).toHaveBeenCalledTimes(1);
    expect(prepareOpenAiBatchReferences).toHaveBeenCalledTimes(1);
    expect(uploadToR2).toHaveBeenCalledTimes(3);
    expect(ingestOpenAiBatchFilePage).toHaveBeenCalledTimes(2);
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      status: "completed",
      completedTasks: 3,
      failedTasks: 0,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      status: "completed",
      phase: "completed",
    });
    // finishAllScheduledFunctions also advances through the seven-day journal
    // cleanup. Application receipts and completed results remain afterwards.
    await expect(
      t.run((ctx) =>
        getStatus(ctx, components.workflow, segment.workflowId as WorkflowId),
      ),
    ).rejects.toThrow("Workflow not found");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("drains 900 tasks from 300 products through nine segments with at most two active", async () => {
    const { t, jobId } = await fixture(300, 3);
    await initialize(t, jobId);
    await initialize(t, jobId);
    expect(await segmentsForJob(t, jobId)).toHaveLength(2);
    const processed = new Set<string>();
    let maxActive = 0;
    while (processed.size < 900) {
      const segments = await segmentsForJob(t, jobId);
      const active = segments.filter(
        (segment) =>
          !["completed", "failed", "cancelled"].includes(segment.status),
      );
      maxActive = Math.max(maxActive, active.length);
      expect(active.length).toBeLessThanOrEqual(2);
      expect(active.length).toBeGreaterThan(0);
      const next = active[0];
      const token = `finish-${processed.size}`;
      expect(
        await t.mutation(internal.openAiDurable.claim, {
          segmentId: next._id,
          token,
        }),
      ).not.toBeNull();
      // The wide test isolates capacity and slot refill from external IO;
      // separate tests below execute preparation and ingestion actions.
      await t.run(async (ctx) => {
        const images = await ctx.db
          .query("generatedImages")
          .withIndex("by_batch_segment", (q) =>
            q.eq("batchSegmentId", next._id),
          )
          .collect();
        expect(images).toHaveLength(100);
        for (const image of images) {
          expect(processed.has(image._id)).toBe(false);
          processed.add(image._id);
          await ctx.db.patch(image._id, {
            status: "generated",
            storageUrl: `https://r2.example.com/${image._id}`,
          });
        }
        await ctx.db.patch(jobId, { completedTasks: processed.size });
      });
      await t.mutation(internal.openAiDurable.finish, {
        segmentId: next._id,
        token,
      });
      await t.mutation(internal.openAiDurable.finish, {
        segmentId: next._id,
        token,
      });
      await initialize(t, jobId);
    }
    const finalSegments = await segmentsForJob(t, jobId);
    expect(finalSegments).toHaveLength(9);
    expect(
      finalSegments.every((segment) => segment.status === "completed"),
    ).toBe(true);
    expect(
      new Set(finalSegments.map((segment) => segment.workflowId)).size,
    ).toBe(9);
    expect(processed.size).toBe(900);
    expect(maxActive).toBe(2);
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      status: "completed",
      completedTasks: 900,
      failedTasks: 0,
    });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("prepares one reference once for a product's three images across segment boundaries", async () => {
    const { t, jobId, imageIds } = await fixture();
    const segments = await initialize(t, jobId, 2, 2);
    for (let index = 0; index < 2; index++)
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segments[0]._id,
      });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segments[1]._id,
    });
    expect(prepareOpenAiBatchReferences).toHaveBeenCalledTimes(1);
    const images = await t.run((ctx) =>
      Promise.all(imageIds.map((id) => ctx.db.get(id))),
    );
    expect(images.every((image) => image?.openAiPrepared)).toBe(true);
    expect(
      new Set(images.map((image) => image?.stagedReferenceUrls?.[0])).size,
    ).toBe(1);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("openAiBatchReferences")
          .withIndex("by_job", (q) => q.eq("jobId", jobId))
          .collect(),
      ),
    ).toHaveLength(1);
    expect(
      (await segmentsForJob(t, jobId)).map((segment) => segment.preparedTasks),
    ).toEqual([2, 1]);
  });

  test("reclaims an interrupted worker and rejects stale or duplicate checkpoints", async () => {
    const { t, jobId, imageIds } = await fixture();
    const [segment] = await initialize(t, jobId);
    const args = { segmentId: segment._id };
    expect(
      await t.mutation(internal.openAiDurable.claim, { ...args, token: "old" }),
    ).not.toBeNull();
    expect(
      await t.mutation(internal.openAiDurable.claim, {
        ...args,
        token: "duplicate",
      }),
    ).toBeNull();
    await t.run((ctx) => ctx.db.patch(segment._id, { leaseUntil: 0 }));
    expect(
      await t.mutation(internal.openAiDurable.claim, { ...args, token: "new" }),
    ).not.toBeNull();
    expect(
      await t.mutation(internal.openAiDurable.checkpoint, {
        ...args,
        token: "old",
        phase: "waiting",
        batchId: "stale-batch",
      }),
    ).toBe(false);
    expect(
      await t.mutation(internal.openAiDurable.prepared, {
        ...args,
        token: "old",
        imageId: imageIds[0],
        urls: ["stale"],
        prompt: "stale",
        vibe: null,
      }),
    ).toBe(false);
    const prepared = {
      ...args,
      token: "new",
      imageId: imageIds[0],
      urls: ["staged"],
      prompt: "prepared",
      vibe: null,
    };
    expect(await t.mutation(internal.openAiDurable.prepared, prepared)).toBe(
      true,
    );
    expect(await t.mutation(internal.openAiDurable.prepared, prepared)).toBe(
      false,
    );
    await t.mutation(internal.openAiDurable.finish, {
      ...args,
      token: "old",
      error: "stale failure",
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      leaseToken: "new",
      phase: "preparing",
      preparedTasks: 1,
    });
  });

  test("recovers accepted work after the network reply is lost before persisting the OpenAI ID", async () => {
    const { t, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "submitting", {
      inputFileName: "input-file",
    });
    vi.mocked(createOpenAiBatchFromFile).mockImplementationOnce(async () => {
      throw new Error("OpenAI accepted the batch but the reply was lost");
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    const interrupted = await t.run((ctx) => ctx.db.get(segment._id));
    expect(interrupted?.batchId).toBeUndefined();
    expect(interrupted?.submissionAttemptedAt).toBeTypeOf("number");
    vi.mocked(findOpenAiBatchBySubmissionKey).mockResolvedValueOnce({
      matches: [
        {
          batchId: "accepted-batch",
          batchStatus: "validating",
          inputFileId: "input-file",
        },
      ],
      cursor: null,
      exhausted: true,
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenCalledWith(
      expect.objectContaining({ submissionKey: segment.submissionKey }),
    );
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "waiting",
      batchId: "accepted-batch",
    });
  });

  test("never re-POSTs an uncertain submission and blocks retry until acceptance is reconciled", async () => {
    const { t, client, jobId, imageIds } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "submitting", {
      inputFileName: "input-file",
    });
    vi.mocked(createOpenAiBatchFromFile).mockRejectedValueOnce(
      new Error("Connection lost after acceptance"),
    );
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    for (let attempt = 0; attempt < 3; attempt++)
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenCalledTimes(3);
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "uncertain",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { status: "failed", failedTasks: 3 });
      for (const imageId of imageIds)
        await ctx.db.patch(imageId, { status: "failed" });
    });
    await expect(client.mutation(api.jobs.retry, { jobId })).rejects.toThrow(
      /uncertain|reconcil|incertaine/i,
    );
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
  });

  test("persists the immutable acceptance receipt even after losing the worker lease", async () => {
    const { t, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "submitting", {
      inputFileName: "input-file",
    });
    vi.mocked(createOpenAiBatchFromFile).mockImplementationOnce(async () => {
      await t.run((ctx) =>
        ctx.db.patch(segment._id, {
          leaseToken: "replacement-worker",
          leaseUntil: 0,
        }),
      );
      return { batchId: "accepted-batch", batchStatus: "validating" };
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      batchId: "accepted-batch",
      phase: "submitting",
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      batchId: "accepted-batch",
      phase: "waiting",
    });
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
    expect(findOpenAiBatchBySubmissionKey).not.toHaveBeenCalled();
  });

  test("reopens the existing paid output at its cursor after exhausting retrieval retries", async () => {
    const { t, client, jobId, imageIds } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "recovering", {
      status: "running",
      batchId: "paid-batch",
      outputFileId: "paid-output",
      resultOffset: 123,
    });
    vi.mocked(ingestOpenAiBatchFilePage).mockRejectedValue(
      new Error("Output temporarily unavailable"),
    );
    for (let failure = 0; failure < 5; failure++)
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      status: "failed",
      failedTasks: 3,
    });
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      status: "failed",
      batchRecoveryPending: true,
    });
    await client.mutation(api.jobs.retry, { jobId });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "recovering",
      resultOffset: 123,
      outputFileId: "paid-output",
    });
    vi.mocked(ingestOpenAiBatchFilePage).mockImplementationOnce(
      async (args) => {
        expect(args.fileId).toBe("paid-output");
        expect(args.byteOffset).toBe(123);
        await args.onItem(
          imageIds[0],
          { bytes: Buffer.from("paid image"), contentType: "image/png" },
          124,
        );
        return { byteOffset: 124, done: false, processed: 1 };
      },
    );
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      status: "postprocessing",
      providerBatchId: "paid-batch",
    });
    expect(await segmentsForJob(t, jobId)).toHaveLength(1);
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test.each(["failure", "success"])(
    "job completion during result ingestion releases its lease and the next step closes the segment (%s)",
    async (outcome) => {
      const { t, jobId, imageIds } = await fixture();
      const [segment] = await initialize(t, jobId);
      await putSegmentInPhase(t, segment._id, "recovering", {
        status: "running",
        batchId: "paid-batch",
        batchStatus: "completed",
        outputFileId: "paid-results",
        resultFileIndex: 0,
        resultOffset: 0,
      });
      await t.run(async (ctx) => {
        for (const imageId of imageIds.slice(0, 2))
          await ctx.db.patch(imageId, {
            status: "generated",
            storageUrl: "https://r2.example.com/kept.png",
          });
        await ctx.db.patch(jobId, { completedTasks: 2 });
      });
      vi.mocked(ingestOpenAiBatchFilePage).mockImplementationOnce(async (args) => {
        await args.onItem(imageIds[2], outcome === "failure"
          ? { error: "Provider timed out downloading a reference" }
          : { bytes: Buffer.from("last paid result"), contentType: "image/png" }, 100);
        if (outcome === "success")
          await t.mutation(internal.jobs.completeImage, {
            imageId: imageIds[2],
            storageUrl: "https://r2.example.com/last-paid-result.png",
            generatedImageUrl: "https://r2.example.com/last-paid-result.png",
            providerBatchId: "paid-batch",
          });
        // A postprocessing worker can finish the job before the ingestion
        // action checkpoints its file cursor and releases its own lease.
        await t.mutation(internal.jobs.finishJobIfDone, { jobId });
        return { byteOffset: 100, done: true, processed: 1 };
      });
      expect(await t.action(internal.openAiDurableActions.advance, { segmentId: segment._id }))
        .toEqual({ done: false, delayMs: 0 });
      const afterIngestion = (await t.run((ctx) => ctx.db.get(segment._id)))!;
      expect(afterIngestion).toMatchObject({ status: "running", phase: "recovering" });
      expect(afterIngestion.leaseToken).toBeUndefined();
      expect(afterIngestion.leaseUntil).toBeUndefined();
      expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
        status: outcome === "failure" ? "failed" : "completed",
      });
      expect(await t.action(internal.openAiDurableActions.advance, { segmentId: segment._id }))
        .toEqual({ done: true, delayMs: 0 });
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        status: outcome === "failure" ? "failed" : "completed",
        phase: outcome === "failure" ? "failed" : "completed",
        ingestedCount: outcome === "failure" ? 2 : 3,
        failedCount: outcome === "failure" ? 1 : 0,
      });
      expect(ingestOpenAiBatchFilePage).toHaveBeenCalledOnce();
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test("a finished job with a live recovery lease keeps its workflow waiting until it can close the segment", async () => {
    const { t, jobId, imageIds } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "recovering", {
      status: "running",
      batchId: "paid-batch",
      batchStatus: "completed",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { status: "failed", completedTasks: 2, failedTasks: 1 });
      for (const imageId of imageIds.slice(0, 2))
        await ctx.db.patch(imageId, { status: "generated", storageUrl: "https://r2.example.com/kept.png" });
      await ctx.db.patch(imageIds[2], { status: "failed", error: "Provider reference download failed" });
    });
    await t.mutation(internal.openAiDurable.claim, { segmentId: segment._id, token: "previous-ingestion-worker" });
    expect(await t.action(internal.openAiDurableActions.advance, { segmentId: segment._id }))
      .toEqual({ done: false, delayMs: 30_000 });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      status: "running", phase: "recovering", leaseToken: "previous-ingestion-worker",
    });
    vi.setSystemTime(Date.now() + 11 * 60_000 + 1);
    expect(await t.action(internal.openAiDurableActions.advance, { segmentId: segment._id }))
      .toEqual({ done: true, delayMs: 0 });
    const finished = (await t.run((ctx) => ctx.db.get(segment._id)))!;
    expect(finished).toMatchObject({ status: "failed", phase: "failed", ingestedCount: 2, failedCount: 1 });
    expect(finished.leaseToken).toBeUndefined();
    expect(finished.leaseUntil).toBeUndefined();
    expect(ingestOpenAiBatchFilePage).not.toHaveBeenCalled();
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("a stale release after job completion cannot clear another worker's lease", async () => {
    const { t, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "recovering", {
      status: "running", batchId: "paid-batch", leaseToken: "replacement-worker", leaseUntil: Date.now() + 60_000,
    });
    await t.run((ctx) => ctx.db.patch(jobId, { status: "failed" }));
    expect(await t.mutation(internal.openAiDurable.checkpoint, {
      segmentId: segment._id, token: "previous-worker", release: true,
    })).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      leaseToken: "replacement-worker", leaseUntil: Date.now() + 60_000,
    });
  });

  test.each(["failed", "completed", "cancelled"] as const)(
    "a token-matched release on a %s job clears only the lease and ignores combined state updates",
    async (status) => {
      const { t, jobId } = await fixture();
      const [segment] = await initialize(t, jobId);
      await putSegmentInPhase(t, segment._id, "recovering", {
        status: "running",
        batchId: "paid-batch",
        batchStatus: "completed",
        resultOffset: 17,
        resultFileIndex: 1,
        error: "Retained ingestion diagnostic",
        leaseToken: "ingestion-worker",
        leaseUntil: Date.now() + 60_000,
      });
      await t.run((ctx) => ctx.db.patch(jobId, { status }));
      await t.mutation(internal.openAiDurable.checkpoint, {
        segmentId: segment._id,
        token: "ingestion-worker",
        release: true,
        phase: "failed",
        batchId: "unexpected-new-batch",
        batchStatus: "in_progress",
        resultOffset: 999,
        resultFileIndex: 9,
        error: "Unexpected replacement diagnostic",
        dispatch: true,
      });
      const released = (await t.run((ctx) => ctx.db.get(segment._id)))!;
      expect(released).toMatchObject({
        status: "running", phase: "recovering", batchId: "paid-batch", batchStatus: "completed",
        resultOffset: 17, resultFileIndex: 1, error: "Retained ingestion diagnostic",
      });
      expect(released.submissionAttemptedAt).toBeUndefined();
      expect(released.leaseToken).toBeUndefined();
      expect(released.leaseUntil).toBeUndefined();
      expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ status });
    },
  );

  test("resumes result ingestion at its checkpoint and ignores already completed or duplicated results", async () => {
    const { t, jobId, imageIds } = await fixture(1, 2);
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "recovering", {
      status: "running",
      batchId: "accepted-batch",
      outputFileId: "output-file",
    });
    const item = {
      bytes: Buffer.from("image"),
      contentType: "image/png",
      extension: "png",
    };
    vi.mocked(ingestOpenAiBatchFilePage).mockImplementationOnce(
      async (args) => {
        await args.onItem(imageIds[0], item, 100);
        throw new Error("Worker interrupted after first committed result");
      },
    );
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      resultOffset: 100,
      phase: "recovering",
    });
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      status: "postprocessing",
    });
    const completed = {
      imageId: imageIds[0],
      storageUrl: "https://r2.example.com/final-1.png",
      generatedImageUrl: "https://r2.example.com/final-1.png",
      providerBatchId: "accepted-batch",
    };
    expect(
      (await t.mutation(internal.jobs.completeImage, completed)).completed,
    ).toBe(true);
    expect(
      (await t.mutation(internal.jobs.completeImage, completed)).completed,
    ).toBe(false);
    vi.mocked(ingestOpenAiBatchFilePage).mockImplementationOnce(
      async (args) => {
        expect(args.byteOffset).toBe(100);
        expect(args.maxItems).toBe(2);
        await args.onItem(imageIds[0], item, 150);
        await args.onItem(imageIds[1], item, 200);
        await args.onItem(imageIds[1], item, 250);
        return { byteOffset: 250, done: false, processed: 2 };
      },
    );
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(uploadToR2).toHaveBeenCalledTimes(2);
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      status: "generated",
      storageUrl: completed.storageUrl,
    });
    expect(await t.run((ctx) => ctx.db.get(imageIds[1]))).toMatchObject({
      status: "postprocessing",
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      resultOffset: 250,
    });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      completedTasks: 1,
      failedTasks: 0,
    });
  });

  test("retries only failed tasks and leaves generated and published images intact", async () => {
    const { t, client, jobId, imageIds } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "failed",
        completedTasks: 2,
        failedTasks: 1,
        openAiDurable: true,
      });
      await ctx.db.patch(imageIds[0], {
        status: "generated",
        storageUrl: "https://r2.example.com/kept.png",
      });
      await ctx.db.patch(imageIds[1], {
        status: "uploaded",
        storageUrl: "https://r2.example.com/published.png",
        shopifyMediaId: "gid://shopify/Media/kept",
      });
      await ctx.db.patch(imageIds[2], {
        status: "failed",
        error: "Provider failed",
      });
    });
    await client.mutation(api.jobs.retry, { jobId });
    const segments = await initialize(t, jobId);
    expect(segments).toHaveLength(1);
    expect(segments[0].imageCount).toBe(1);
    const images = await t.run((ctx) =>
      Promise.all(imageIds.map((id) => ctx.db.get(id))),
    );
    expect(images[0]).toMatchObject({
      status: "generated",
      storageUrl: "https://r2.example.com/kept.png",
    });
    expect(images[1]).toMatchObject({
      status: "uploaded",
      shopifyMediaId: "gid://shopify/Media/kept",
    });
    expect(images[2]).toMatchObject({
      status: "queued",
      batchSegmentId: segments[0]._id,
    });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      totalTasks: 3,
      completedTasks: 2,
      failedTasks: 0,
    });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("limits active OpenAI segments across concurrent bulks", async () => {
    const { t, jobId, imageIds } = await fixture(2, 3);
    await initialize(t, jobId, 3, 2);
    const secondJobId = await t.run(async (ctx) => {
      const job = (await ctx.db.get(jobId))!;
      const { _id, _creationTime, ...copy } = job;
      void _id;
      void _creationTime;
      const secondId = await ctx.db.insert("generationJobs", {
        ...copy,
        status: "queued",
        totalTasks: 3,
      });
      for (const imageId of imageIds.slice(0, 3)) {
        const image = (await ctx.db.get(imageId))!;
        const { _id, _creationTime, ...copy } = image;
        void _id;
        void _creationTime;
        await ctx.db.insert("generatedImages", {
          ...copy,
          jobId: secondId,
          batchSegmentId: null,
        });
      }
      return secondId;
    });
    expect(await initialize(t, secondJobId, 3, 2)).toHaveLength(0);
    const [firstSegment] = await segmentsForJob(t, jobId);
    await t.mutation(internal.openAiDurable.claim, {
      segmentId: firstSegment._id,
      token: "finish",
    });
    await t.run(async (ctx) => {
      const images = await ctx.db
        .query("generatedImages")
        .withIndex("by_batch_segment", (q) =>
          q.eq("batchSegmentId", firstSegment._id),
        )
        .collect();
      for (const image of images)
        await ctx.db.patch(image._id, {
          status: "generated",
          storageUrl: "https://r2.example.com/final",
        });
    });
    await t.mutation(internal.openAiDurable.finish, {
      segmentId: firstSegment._id,
      token: "finish",
    });
    expect(await initialize(t, secondJobId)).toHaveLength(1);
    const all = await t.run((ctx) =>
      ctx.db.query("generationBatchSegments").collect(),
    );
    expect(
      all.filter((s) => s.status === "submitting" || s.status === "running"),
    ).toHaveLength(2);
  });

  test("restarts a failed Workflow from its persisted fence and cursor", async () => {
    const { t, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "uncertain", {
      inputFileName: "input-file",
      submissionAttemptedAt: 999_000,
      resultOffset: 170,
      reconcileCursor: "page-two",
      leaseUntil: Date.now() + 660_000,
    });
    await t.mutation(internal.openAiDurable.workflowCompleted, {
      workflowId: segment.workflowId as WorkflowId,
      result: { kind: "failed", error: "Node process interrupted" },
      context: { segmentId: segment._id },
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "uncertain",
      resultOffset: 170,
      reconcileCursor: "page-two",
    });
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      scheduled.some((s) => s.name === "openAiDurable:restartSegment"),
    ).toBe(true);
    vi.setSystemTime(Date.now() + 661_000);
    await t.mutation(internal.openAiDurable.restartSegment, {
      segmentId: segment._id,
    });
    const resumed = (await t.run((ctx) => ctx.db.get(segment._id)))!;
    expect(resumed.workflowId).toBeDefined();
    expect(resumed.workflowId).not.toBe(segment.workflowId);
    expect(resumed.submissionKey).toBe(segment.submissionKey);
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(findOpenAiBatchBySubmissionKey).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "page-two" }),
    );
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test.each(["receipt", "lost-reply"])(
    "continues reconciliation after cancellation during create (%s)",
    async (outcome) => {
      const { t, client, jobId } = await fixture();
      const [segment] = await initialize(t, jobId);
      await putSegmentInPhase(t, segment._id, "submitting", {
        inputFileName: "input-file",
      });
      vi.mocked(createOpenAiBatchFromFile).mockImplementationOnce(async () => {
        await t.mutation(internal.jobs.cancelInternal, {
          jobId,
          reason: "Cancel while creating",
        });
        if (outcome === "lost-reply") throw new Error("Accepted reply lost");
        return { batchId: "accepted-batch", batchStatus: "validating" };
      });
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        status: "cancelled",
        cancellationPending: true,
      });
      await expect(client.mutation(api.jobs.retry, { jobId })).rejects.toThrow(
        /uncertain|pending/,
      );
      if (outcome === "lost-reply") {
        vi.mocked(findOpenAiBatchBySubmissionKey).mockResolvedValueOnce({
          matches: [
            {
              batchId: "accepted-batch",
              inputFileId: "input-file",
              batchStatus: "in_progress",
            },
          ],
          cursor: null,
          exhausted: true,
        });
        await t.action(internal.openAiDurableActions.advance, {
          segmentId: segment._id,
        });
      }
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        batchId: "accepted-batch",
      });
      vi.mocked(getOpenAiBatchState).mockResolvedValueOnce({
        batchStatus: "in_progress",
        inputFileId: "input-file",
        metadata: {},
        outputFileId: null,
        errorFileId: null,
        error: null,
      });
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
      expect(cancelOpenAiBatch).toHaveBeenCalledTimes(1);
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        cancellationPending: true,
      });
      vi.mocked(getOpenAiBatchState).mockResolvedValueOnce({
        batchStatus: "cancelled",
        inputFileId: "input-file",
        metadata: {},
        outputFileId: null,
        errorFileId: null,
        error: null,
      });
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        cancellationPending: false,
        cancellationReconciled: true,
      });
      await client.mutation(api.jobs.retry, { jobId });
      expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
    },
  );

  test("retains a definite rejection received after cancellation and fences stale reconciliation", async () => {
    const { t, client, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "submitting", {
      inputFileName: "input-file",
    });
    vi.mocked(createOpenAiBatchFromFile).mockImplementationOnce(async () => {
      await t.mutation(internal.jobs.cancelInternal, {
        jobId,
        reason: "Cancel while creating",
      });
      throw new OpenAiBatchRejectedError("OpenAI rejected input (400)");
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    await t.mutation(internal.openAiDurable.cancelledCheckpoint, {
      segmentId: segment._id,
      cursor: null,
      matches: [],
      done: false,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      submissionRejected: true,
      cancellationPending: false,
      cancellationReconciled: true,
    });
    await client.mutation(api.jobs.retry, { jobId });
    expect(findOpenAiBatchBySubmissionKey).not.toHaveBeenCalled();
    expect(createOpenAiBatchFromFile).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])(
    "frees an externally failed bulk only after resolving provider work (dispatched=%s)",
    async (dispatched) => {
      const { t, client, jobId, imageIds } = await fixture();
      const [segment] = await initialize(t, jobId);
      if (dispatched)
        await putSegmentInPhase(t, segment._id, "waiting", {
          status: "running",
          inputFileName: "input-file",
          batchId: "accepted-batch",
          submissionAttemptedAt: 999_000,
        });
      await t.run(async (ctx) => {
        await ctx.db.patch(jobId, { status: "failed", failedTasks: 3 });
        for (const imageId of imageIds)
          await ctx.db.patch(imageId, { status: "failed" });
      });
      if (dispatched)
        await expect(
          client.mutation(api.jobs.retry, { jobId }),
        ).rejects.toThrow(/still active/);
      await t.action(internal.openAiDurableActions.advance, {
        segmentId: segment._id,
      });
      expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
        status: "cancelled",
        cancellationPending: dispatched,
      });
      if (dispatched) {
        vi.mocked(getOpenAiBatchState).mockResolvedValueOnce({
          batchStatus: "in_progress",
          inputFileId: "input-file",
          metadata: {},
          outputFileId: null,
          errorFileId: null,
          error: null,
        });
        await t.action(internal.openAiDurableActions.advance, {
          segmentId: segment._id,
        });
        await expect(
          client.mutation(api.jobs.retry, { jobId }),
        ).rejects.toThrow(/pending/);
        vi.mocked(getOpenAiBatchState).mockResolvedValueOnce({
          batchStatus: "cancelled",
          inputFileId: "input-file",
          metadata: {},
          outputFileId: null,
          errorFileId: null,
          error: null,
        });
        await t.action(internal.openAiDurableActions.advance, {
          segmentId: segment._id,
        });
        expect(cancelOpenAiBatch).toHaveBeenCalledTimes(1);
      }
      await client.mutation(api.jobs.retry, { jobId });
      expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
    },
  );

  test("preserves ambiguous paginated matches and never adopts or resubmits either batch", async () => {
    const { t, jobId } = await fixture();
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "uncertain", {
      inputFileName: "input-file",
      submissionAttemptedAt: 999_000,
    });
    vi.mocked(findOpenAiBatchBySubmissionKey)
      .mockResolvedValueOnce({
        matches: [
          {
            batchId: "batch-one",
            batchStatus: "validating",
            inputFileId: "input-file",
          },
        ],
        cursor: "page-two",
        exhausted: false,
      })
      .mockResolvedValueOnce({
        matches: [
          {
            batchId: "batch-two",
            batchStatus: "validating",
            inputFileId: "input-file",
          },
        ],
        cursor: null,
        exhausted: true,
      });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(segment._id)))?.batchId,
    ).toBeUndefined();
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    await t.action(internal.openAiDurableActions.advance, {
      segmentId: segment._id,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      phase: "uncertain",
      reconcileMatches: ["batch-one", "batch-two"],
    });
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });

  test("mixed retries reuse paid result files and staged images while keeping completed results", async () => {
    const { t, client, jobId, imageIds } = await fixture(1, 5);
    const [segment] = await initialize(t, jobId);
    await putSegmentInPhase(t, segment._id, "recovering", {
      status: "failed",
      batchId: "paid-batch",
      outputFileId: "paid-output",
      resultOffset: 55,
      resultFileIndex: 0,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "failed",
        completedTasks: 2,
        failedTasks: 3,
      });
      await ctx.db.patch(imageIds[0], {
        status: "failed",
        batchRecoveryPending: true,
      });
      await ctx.db.patch(imageIds[1], {
        status: "failed",
        postProcessingInputUrl: "https://r2.example.com/already-paid.png",
        postProcessingInputContentType: "image/png",
        postProcessingInputExtension: "png",
      });
      await ctx.db.patch(imageIds[2], {
        status: "failed",
        error: "Provider rejected this item",
      });
      await ctx.db.patch(imageIds[3], {
        status: "generated",
        storageUrl: "https://r2.example.com/final.png",
      });
      await ctx.db.patch(imageIds[4], {
        status: "uploaded",
        storageUrl: "https://r2.example.com/published.png",
        shopifyMediaId: "media-kept",
      });
    });
    await client.mutation(api.jobs.retry, { jobId });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      status: "running",
      completedTasks: 2,
      failedTasks: 0,
      totalTasks: 5,
    });
    expect(await t.run((ctx) => ctx.db.get(segment._id))).toMatchObject({
      status: "running",
      phase: "recovering",
      batchId: "paid-batch",
      outputFileId: "paid-output",
      resultOffset: 55,
    });
    const images = await t.run((ctx) =>
      Promise.all(imageIds.map((id) => ctx.db.get(id))),
    );
    expect(images[0]).toMatchObject({
      status: "generating",
      providerBatchId: "paid-batch",
      batchSegmentId: segment._id,
    });
    expect(images[1]).toMatchObject({
      status: "postprocessing",
      postProcessingInputUrl: "https://r2.example.com/already-paid.png",
      providerBatchId: "paid-batch",
    });
    expect(images[2]).toMatchObject({ status: "queued", batchSegmentId: null });
    expect(images[3]).toMatchObject({
      status: "generated",
      storageUrl: "https://r2.example.com/final.png",
    });
    expect(images[4]).toMatchObject({
      status: "uploaded",
      shopifyMediaId: "media-kept",
    });
    const segments = await initialize(t, jobId);
    expect(segments).toHaveLength(2);
    expect(segments.find((s) => s._id !== segment._id)?.imageCount).toBe(1);
    expect(createOpenAiBatchFromFile).not.toHaveBeenCalled();
  });
});
