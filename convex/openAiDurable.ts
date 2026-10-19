import {
  WorkflowManager,
  start,
  cleanup,
  vWorkflowId,
  vResultValidator,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { refreshJobSummary } from "./jobs";
import { refreshProductSummary } from "./products";

// External create calls are fenced in the database before dispatch. Workflow
// retries may replay reads and preparation, but never replay a create blindly.
const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 3,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 5, initialBackoffMs: 15_000, base: 2 },
  },
});

export const segmentWorkflow = workflow
  .define({
    args: { segmentId: v.id("generationBatchSegments") },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    while (true) {
      const next: { done: boolean; delayMs: number } = await step.runAction(
        internal.openAiDurableActions.advance,
        args,
      );
      if (next.done) return null;
      if (next.delayMs) await step.sleep(next.delayMs);
    }
  });

const terminal = (s: Doc<"generationBatchSegments">) =>
  ["completed", "failed", "cancelled"].includes(s.status);

async function startSegment(
  ctx: MutationCtx,
  segmentId: Id<"generationBatchSegments">,
) {
  const workflowId = await start(
    ctx,
    internal.openAiDurable.segmentWorkflow,
    { segmentId },
    {
      onComplete: internal.openAiDurable.workflowCompleted,
      context: { segmentId },
    },
  );
  await ctx.db.patch(segmentId, { workflowId });
}

export const workflowCompleted = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ segmentId: v.id("generationBatchSegments") }),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const s = await ctx.db.get(args.context.segmentId);
    const cancellationPending =
      s?.status === "cancelled" &&
      s.submissionAttemptedAt &&
      !s.submissionRejected &&
      !s.cancellationReconciled;
    if (
      s?.workflowId === args.workflowId &&
      (!terminal(s) || cancellationPending) &&
      args.result.kind === "failed"
    ) {
      await ctx.db.patch(s._id, {
        workflowId: undefined,
        error: `Worker interrupted: ${args.result.error}`,
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        Math.max(60_000, (s.leaseUntil ?? 0) - Date.now() + 1000),
        internal.openAiDurable.restartSegment,
        { segmentId: s._id },
      );
    }
    await ctx.scheduler.runAfter(
      7 * 24 * 60 * 60_000,
      internal.openAiDurable.cleanupWorkflow,
      { workflowId: args.workflowId },
    );
    await ctx.scheduler.runAfter(0, internal.openAiDurable.resumeStarts, {});
    return null;
  },
});

export const cleanupWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await cleanup(ctx, components.workflow, args.workflowId);
    return null;
  },
});

export const restartSegment = internalMutation({
  args: { segmentId: v.id("generationBatchSegments") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const s = await ctx.db.get(args.segmentId);
    if (
      !s ||
      (terminal(s) &&
        !(
          s.status === "cancelled" &&
          s.submissionAttemptedAt &&
          !s.cancellationReconciled
        )) ||
      s.workflowId
    )
      return null;
    const job = await ctx.db.get(s.jobId);
    if (!job || (job.status === "cancelled" && !s.submissionAttemptedAt))
      return null;
    await startSegment(ctx, s._id);
    return null;
  },
});

async function fillSlots(ctx: MutationCtx, job: Doc<"generationJobs">) {
  if (
    job.status === "cancelled" ||
    job.status === "completed" ||
    job.status === "failed"
  )
    return;
  // Uncertain submissions keep their reserved slot. Independent work can use
  // the remaining capacity without replaying that submission.
  const globalMaximum = job.openAiBatchConcurrency ?? 2;
  const globalActive = [
    ...(await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_provider_and_status", (q) =>
        q.eq("provider", "openai").eq("status", "submitting"),
      )
      .take(4)),
    ...(await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_provider_and_status", (q) =>
        q.eq("provider", "openai").eq("status", "running"),
      )
      .take(4)),
    ...(await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_cancellation_pending", (q) =>
        q.eq("cancellationPending", true),
      )
      .take(4)),
  ];
  const available = Math.max(0, globalMaximum - globalActive.length);
  for (let slot = 0; slot < available; slot++) {
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job_and_status_and_segment", (q) =>
        q
          .eq("jobId", job._id)
          .eq("status", "queued")
          .eq("batchSegmentId", null),
      )
      .take(job.openAiBatchSize ?? 100);
    // Historical rows may omit batchSegmentId entirely.
    if (!images.length)
      images.push(
        ...(await ctx.db
          .query("generatedImages")
          .withIndex("by_job_and_status_and_segment", (q) =>
            q
              .eq("jobId", job._id)
              .eq("status", "queued")
              .eq("batchSegmentId", undefined),
          )
          .take(job.openAiBatchSize ?? 100)),
      );
    if (!images.length) return;
    const now = Date.now();
    const segmentId = await ctx.db.insert("generationBatchSegments", {
      jobId: job._id,
      provider: "openai",
      status: "submitting",
      phase: "preparing",
      imageCount: images.length,
      preparedTasks: 0,
      ingestedCount: 0,
      failedCount: 0,
      resultOffset: 0,
      resultFileIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    for (const image of images)
      await ctx.db.patch(image._id, {
        batchSegmentId: segmentId,
        openAiPrepared: false,
        stagedReferenceUrls: undefined,
        updatedAt: now,
      });
    await ctx.db.patch(segmentId, { submissionKey: `segment:${segmentId}` });
    await startSegment(ctx, segmentId);
  }
}

export const initialize = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    batchSize: v.optional(v.number()),
    concurrency: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.executionMode !== "batch" ||
      job.imageProvider !== "openai" ||
      ["cancelled", "completed", "failed"].includes(job.status)
    )
      return null;
    if (!job.openAiDurable && job.batchId) {
      const existing = await ctx.db
        .query("generationBatchSegments")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(1);
      if (!existing.length) return null; // Preserve the pre-segment ingestion path.
    }
    const patch = {
      openAiDurable: true,
      status: "running" as const,
      openAiBatchSize:
        job.openAiBatchSize ??
        Math.max(
          1,
          Math.min(
            100,
            Math.floor(
              args.batchSize ??
                (Number(process.env.OPENAI_BATCH_SEGMENT_SIZE) || 100),
            ),
          ),
        ),
      openAiBatchConcurrency:
        job.openAiBatchConcurrency ??
        Math.max(
          1,
          Math.min(
            3,
            Math.floor(
              args.concurrency ??
                (Number(process.env.OPENAI_BATCH_MAX_CONCURRENT) || 2),
            ),
          ),
        ),
      startedAt: job.startedAt ?? Date.now(),
      batchSubmitStartedAt: job.batchSubmitStartedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(job._id, patch);
    await fillSlots(ctx, { ...job, ...patch });
    return null;
  },
});

export const resumeStarts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const queued = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_and_execution_and_status", (q) =>
        q
          .eq("imageProvider", "openai")
          .eq("executionMode", "batch")
          .eq("status", "queued"),
      )
      .take(2);
    for (const job of queued)
      await ctx.runMutation(internal.openAiDurable.initialize, {
        jobId: job._id,
      });
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_open_ai_durable_and_status", (q) =>
        q.eq("openAiDurable", true).eq("status", "running"),
      )
      .take(10);
    for (const job of running) await fillSlots(ctx, job);
    return null;
  },
});

export const claim = internalMutation({
  args: { segmentId: v.id("generationBatchSegments"), token: v.string() },
  returns: v.union(v.null(), schema.doc("generationBatchSegments")),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.segmentId);
    if (!s || terminal(s)) return null;
    const job = await ctx.db.get(s.jobId);
    if (
      !job ||
      job.status === "cancelled" ||
      (job.status !== "running" &&
        s.phase !== "recovering" &&
        !s.submissionRejected) ||
      (s.leaseUntil ?? 0) > Date.now()
    )
      return null;
    const patch = {
      leaseToken: args.token,
      leaseUntil: Date.now() + 11 * 60_000,
    };
    await ctx.db.patch(s._id, patch);
    return { ...s, ...patch };
  },
});

// Operator-only replacement after a fresh, exhaustive provider scan. An empty
// automatic reconciliation never invokes this mutation or resets a create fence.
export const replaceUnacceptedSegment = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    expectedSubmissionKey: v.string(),
    expectedInputFileId: v.string(),
    expectedAttemptedAt: v.number(),
    token: v.string(),
    verifiedAbsentAt: v.number(),
  },
  returns: v.object({
    retiredSegmentId: v.id("generationBatchSegments"),
    replacementSegmentId: v.id("generationBatchSegments"),
  }),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.segmentId);
    const job = s ? await ctx.db.get(s.jobId) : null;
    const now = Date.now();
    if (!s || !job || job.status !== "running" || s.provider !== "openai" ||
      s.status !== "submitting" || s.phase !== "uncertain" || s.batchId ||
      s.submissionKey !== args.expectedSubmissionKey ||
      s.inputFileName !== args.expectedInputFileId ||
      s.submissionAttemptedAt !== args.expectedAttemptedAt ||
      s.leaseToken !== args.token || (s.leaseUntil ?? 0) <= now)
      throw new Error("Uncertain submission changed or recovery lease expired.");
    if (now - args.expectedAttemptedAt < 30 * 60_000 ||
      args.verifiedAbsentAt > now || now - args.verifiedAbsentAt > 60_000)
      throw new Error("Recovery requires an old submission and a fresh complete OpenAI scan.");
    const images = await ctx.db.query("generatedImages")
      .withIndex("by_batch_segment", q => q.eq("batchSegmentId", s._id))
      .take(101);
    if (!images.length || s.imageCount > 100 || images.length !== s.imageCount ||
      s.preparedTasks !== s.imageCount || images.some(image =>
        image.jobId !== job._id || image.status !== "queued" ||
        !image.openAiPrepared || image.providerBatchId ||
        image.storageUrl || image.generatedImageUrl))
      throw new Error("Recovery only replaces prepared, unaccepted queued image tasks.");
    const replacementSegmentId = await ctx.db.insert("generationBatchSegments", {
      jobId: job._id,
      provider: "openai",
      status: "submitting",
      phase: "submitting",
      inputFileName: s.inputFileName,
      imageCount: images.length,
      preparedTasks: images.length,
      ingestedCount: 0,
      failedCount: 0,
      resultOffset: 0,
      resultFileIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(replacementSegmentId, {
      submissionKey: `segment:${replacementSegmentId}`,
    });
    await ctx.db.patch(s._id, {
      status: "cancelled",
      phase: "failed",
      cancellationPending: false,
      cancellationReconciled: true,
      submissionRecovery: { checkedAt: args.verifiedAbsentAt, replacementSegmentId },
      leaseToken: undefined,
      leaseUntil: undefined,
      error: `Operator recovery after complete OpenAI scan at ${new Date(args.verifiedAbsentAt).toISOString()} found no batch by submission key or input file. Replacement: ${replacementSegmentId}. Previous error: ${s.error ?? "unknown"}`,
      updatedAt: now,
    });
    for (const image of images) await ctx.db.patch(image._id, {
      batchSegmentId: replacementSegmentId,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { updatedAt: now });
    await startSegment(ctx, replacementSegmentId);
    await ctx.scheduler.runAfter(0, internal.openAiDurable.resumeStarts, {});
    return { retiredSegmentId: s._id, replacementSegmentId };
  },
});

export const context = internalQuery({
  args: { segmentId: v.id("generationBatchSegments") },
  returns: v.union(
    v.null(),
    v.object({
      job: schema.doc("generationJobs"),
      segment: schema.doc("generationBatchSegments"),
      images: v.array(schema.doc("generatedImages")),
    }),
  ),
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return null;
    const job = await ctx.db.get(segment.jobId);
    if (!job) return null;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_batch_segment", (q) => q.eq("batchSegmentId", segment._id))
      .take(100);
    return { job, segment, images };
  },
});

export const imageForIngestion = internalQuery({
  args: { imageId: v.id("generatedImages") },
  returns: v.union(v.null(), schema.doc("generatedImages")),
  handler: async (ctx, args) => ctx.db.get(args.imageId),
});

// A provider receipt has an immutable submission identity. Persist it even if
// cancellation raced with the network response, so accepted work is never lost.
export const saveReceipt = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    submissionKey: v.string(),
    inputFileId: v.string(),
    batchId: v.string(),
    batchStatus: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const s = await ctx.db.get(args.segmentId);
    if (
      !s ||
      s.submissionKey !== args.submissionKey ||
      s.inputFileName !== args.inputFileId
    )
      return false;
    if (s.batchId && s.batchId !== args.batchId)
      throw new Error(
        "Conflicting OpenAI receipt; manual reconciliation required.",
      );
    await ctx.db.patch(s._id, {
      batchId: args.batchId,
      batchStatus: args.batchStatus ?? s.batchStatus,
      submittedAt: s.submittedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    return true;
  },
});

// A definite rejection is also a provider receipt. Cancellation must not turn
// a rejected create into an indefinitely uncertain submission.
export const saveRejection = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    submissionKey: v.string(),
    inputFileId: v.string(),
    error: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const s = await ctx.db.get(args.segmentId);
    if (
      !s ||
      s.submissionKey !== args.submissionKey ||
      s.inputFileName !== args.inputFileId ||
      s.batchId
    )
      return false;
    await ctx.db.patch(s._id, {
      submissionRejected: true,
      error: args.error,
      ...(s.status === "cancelled"
        ? {
            cancellationPending: false,
            cancellationReconciled: true,
          }
        : {}),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const stopFailedSegment = internalMutation({
  args: { segmentId: v.id("generationBatchSegments") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const s = await ctx.db.get(args.segmentId);
    const job = s ? await ctx.db.get(s.jobId) : null;
    if (
      !s ||
      job?.status !== "failed" ||
      terminal(s) ||
      s.phase === "recovering"
    )
      return false;
    const pending = Boolean(s.submissionAttemptedAt && !s.submissionRejected);
    await ctx.db.patch(s._id, {
      status: "cancelled",
      cancellationPending: pending,
      leaseToken: undefined,
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
    return pending;
  },
});

export const cancelledCheckpoint = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    cursor: v.union(v.string(), v.null()),
    matches: v.array(v.string()),
    done: v.optional(v.boolean()),
    batchStatus: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const s = await ctx.db.get(args.segmentId);
    if (
      !s ||
      s.status !== "cancelled" ||
      s.submissionRejected ||
      s.cancellationReconciled
    )
      return null;
    await ctx.db.patch(s._id, {
      reconcileCursor: args.cursor,
      reconcileMatches: args.matches,
      cancellationReconciled: args.done ?? false,
      batchStatus: args.batchStatus ?? s.batchStatus,
      cancellationPending: !(args.done ?? false),
      error: args.done
        ? null
        : "Cancelled submission uncertain: checking OpenAI before closing it.",
      updatedAt: Date.now(),
    });
    return null;
  },
});

const phase = schema.tables.generationBatchSegments.validator.fields.phase;
export const checkpoint = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    token: v.string(),
    phase,
    inputFileName: v.optional(v.string()),
    batchId: v.optional(v.string()),
    batchStatus: v.optional(v.string()),
    outputFileId: v.optional(v.union(v.string(), v.null())),
    errorFileId: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    resultOffset: v.optional(v.number()),
    resultFileIndex: v.optional(v.number()),
    reconcileCursor: v.optional(v.union(v.string(), v.null())),
    reconcileMatches: v.optional(v.array(v.string())),
    stepFailures: v.optional(v.number()),
    release: v.optional(v.boolean()),
    dispatch: v.optional(v.boolean()),
    submissionRejected: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.segmentId);
    const job = s ? await ctx.db.get(s.jobId) : null;
    if (
      !s ||
      !job ||
      terminal(s) ||
      s.leaseToken !== args.token
    )
      return false;
    if (job.status !== "running") {
      // An ingestion callback can finish the job before the worker's finally
      // block. Its owner must still release the lease, without advancing state
      // or reviving work after completion/cancellation.
      if (!args.release) return false;
      await ctx.db.patch(s._id, {
        leaseToken: undefined,
        leaseUntil: undefined,
      });
      return true;
    }
    const { segmentId, token: _token, release, dispatch, ...updates } = args;
    void _token;
    const patch = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(segmentId, {
      ...patch,
      ...(dispatch
        ? { submissionAttemptedAt: s.submissionAttemptedAt ?? Date.now() }
        : {}),
      ...(args.batchId
        ? {
            status: "running" as const,
            submittedAt: s.submittedAt ?? Date.now(),
          }
        : {}),
      ...(release ? { leaseToken: undefined, leaseUntil: undefined } : {}),
      updatedAt: Date.now(),
    });
    if (args.batchId) {
      const images = await ctx.db
        .query("generatedImages")
        .withIndex("by_batch_segment", (q) => q.eq("batchSegmentId", segmentId))
        .take(100);
      for (const image of images)
        if (image.status === "queued")
          await ctx.db.patch(image._id, {
            status: "generating",
            providerBatchId: args.batchId,
            updatedAt: Date.now(),
          });
      if (!job.batchId)
        await ctx.db.patch(job._id, {
          batchId: args.batchId,
          updatedAt: Date.now(),
        });
      const queued = await ctx.db
        .query("generatedImages")
        .withIndex("by_job_and_status", (q) =>
          q.eq("jobId", job._id).eq("status", "queued"),
        )
        .take(1);
      if (!queued.length)
        await ctx.db.patch(job._id, {
          allBatchesSubmittedAt: job.allBatchesSubmittedAt ?? Date.now(),
        });
    }
    return true;
  },
});

export const claimReference = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    productId: v.id("products"),
    sourceUrl: v.string(),
    token: v.string(),
  },
  returns: v.object({
    readyUrl: v.union(v.string(), v.null()),
    claimed: v.boolean(),
    referenceId: v.id("openAiBatchReferences"),
  }),
  handler: async (ctx, args) => {
    let ref = await ctx.db
      .query("openAiBatchReferences")
      .withIndex("by_job_and_product_and_source", (q) =>
        q
          .eq("jobId", args.jobId)
          .eq("productId", args.productId)
          .eq("sourceUrl", args.sourceUrl),
      )
      .unique();
    if (!ref) {
      const id = await ctx.db.insert("openAiBatchReferences", {
        jobId: args.jobId,
        productId: args.productId,
        sourceUrl: args.sourceUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      ref = (await ctx.db.get(id))!;
    }
    if (ref.url)
      return { readyUrl: ref.url, claimed: false, referenceId: ref._id };
    if ((ref.leaseUntil ?? 0) > Date.now())
      return { readyUrl: null, claimed: false, referenceId: ref._id };
    await ctx.db.patch(ref._id, {
      leaseToken: args.token,
      leaseUntil: Date.now() + 11 * 60_000,
    });
    return { readyUrl: null, claimed: true, referenceId: ref._id };
  },
});

export const saveReference = internalMutation({
  args: {
    referenceId: v.id("openAiBatchReferences"),
    token: v.string(),
    url: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ref = await ctx.db.get(args.referenceId);
    if (!ref || ref.leaseToken !== args.token) return false;
    await ctx.db.patch(ref._id, {
      url: args.url,
      leaseToken: undefined,
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const prepared = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    token: v.string(),
    imageId: v.id("generatedImages"),
    urls: v.array(v.string()),
    prompt: v.string(),
    vibe: v.union(v.string(), v.null()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    const image = await ctx.db.get(args.imageId);
    if (
      !segment ||
      segment.leaseToken !== args.token ||
      terminal(segment) ||
      !image ||
      image.openAiPrepared ||
      image.batchSegmentId !== segment._id ||
      image.status !== "queued"
    )
      return false;
    await ctx.db.patch(image._id, {
      openAiPrepared: true,
      stagedReferenceUrls: args.urls,
      finalPromptUsed: args.prompt,
      vibeUsed: args.vibe,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(segment._id, {
      preparedTasks: (segment.preparedTasks ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    token: v.string(),
    error: v.optional(v.string()),
    resumeResults: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.segmentId);
    if (!s || terminal(s) || s.leaseToken !== args.token) return null;
    const job = await ctx.db.get(s.jobId);
    if (!job || job.status === "cancelled") return null;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_batch_segment", (q) => q.eq("batchSegmentId", s._id))
      .take(100);
    // Missing/error output rows are failed only after both output files reached EOF.
    for (const image of images)
      if (image.status === "queued" || image.status === "generating") {
        await ctx.runMutation(internal.jobs.failImage, {
          imageId: image._id,
          error: args.error ?? "No batch result returned for this image.",
          providerBatchId: s.batchId,
          expectedSegmentId: s._id,
          deferSummary: true,
          batchRecoveryPending: args.resumeResults ?? false,
        });
      }
    const failedCount = images.filter((i) =>
      ["failed", "canceled", "queued", "generating"].includes(i.status),
    ).length;
    await ctx.db.patch(s._id, {
      status: failedCount ? "failed" : "completed",
      phase: failedCount ? "failed" : "completed",
      error:
        args.error ??
        (failedCount ? `${failedCount} image task(s) failed.` : null),
      ingestedCount: images.length - failedCount,
      failedCount,
      leaseToken: undefined,
      leaseUntil: undefined,
      providerDoneAt: s.providerDoneAt ?? Date.now(),
      ingestionCompletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await refreshJobSummary(ctx, job._id);
    for (const productId of new Set(images.map((i) => i.productId)))
      await refreshProductSummary(ctx, productId);
    const currentJob = await ctx.db.get(job._id);
    if (currentJob) await fillSlots(ctx, currentJob);
    await ctx.scheduler.runAfter(
      0,
      internal.generation.processPostprocessingJob,
      { jobId: job._id },
    );
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
    await ctx.scheduler.runAfter(0, internal.openAiDurable.resumeStarts, {});
    return null;
  },
});
