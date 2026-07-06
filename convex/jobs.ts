import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import {
  canResumeBackgroundRemoval,
  cancelImagePatch,
  generatingProductPatch,
  isActiveImageStatus,
  isRetryableImageStatus,
  isTerminalJobStatus,
  retryImagePatch,
  supersedeImagePatch,
} from "./jobs/lifecycle";
import { currentGenerationEngine } from "./jobs/engine";
import { buildImageTasks } from "./jobs/planning";
import {
  getStoredReviewState,
  jobNeedsImageCostFallback,
  listedJob,
  summarizeImageCosts,
  summarizeJobCostWithFallback,
} from "./jobs/summaries";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  executionModeFilter,
  jobStatusFilter,
  providerFilter,
  reviewFilter,
} from "./jobs/validators";
import {
  promptSettingsForScope,
  promptsForScope,
} from "./prompts/repository";
import { sanitizeModelReferences } from "./prompts/access";
import { refreshProductSummary } from "./products";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
} from "./shopScope";

type CompleteImageResult = {
  completed: boolean;
  cleanupUrls: string[];
};

function uniqueUrls(urls: Array<string | null | undefined>) {
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
}

function executionPatchForJob(
  job: Doc<"generationJobs">,
  images: Doc<"generatedImages">[],
  now = job.updatedAt,
) {
  if (job.isHidden || job.status === "cancelled") return {};
  const completedTasks = images.filter(
    (image) => image.status === "generated" || image.status === "uploaded",
  ).length;
  const failedTasks = images.filter(
    (image) => image.status === "failed" || image.status === "canceled",
  ).length;
  const done = completedTasks + failedTasks >= job.totalTasks;
  return {
    completedTasks,
    failedTasks,
    ...(done
      ? {
          status: failedTasks > 0 ? ("failed" as const) : ("completed" as const),
          error:
            failedTasks > 0 ? `${failedTasks} image task(s) failed.` : null,
          completedAt: job.completedAt ?? now,
        }
      : job.status === "failed" || job.status === "completed"
        ? {
            status: "running" as const,
            completedAt: undefined,
            error: null,
          }
        : {}),
  };
}

export async function refreshJobSummary(
  ctx: { db: any },
  jobId: Id<"generationJobs">,
) {
  const job = await ctx.db.get(jobId);
  if (!job) return null;
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_job", (q: any) => q.eq("jobId", jobId))
    .collect();
  const costSummary = summarizeImageCosts(job, images);
  const reviewable: Doc<"generatedImages">[] = images.filter(
    (image: Doc<"generatedImages">) =>
      image.storageUrl &&
      (image.status === "generated" || image.status === "uploaded"),
  );
  const executionPatch = executionPatchForJob(job, images, Date.now());
  const patch = {
    ...executionPatch,
    generationCost: costSummary.generationCost,
    inputTokens: costSummary.inputTokens,
    outputTokens: costSummary.outputTokens,
    pricedImageCount: costSummary.pricedImageCount,
    reviewTotal: reviewable.length,
    reviewPending: reviewable.filter(
      (image) => (image.reviewStatus ?? "pending") === "pending",
    ).length,
    reviewApproved: reviewable.filter(
      (image) => image.reviewStatus === "approved",
    ).length,
    reviewRejected: reviewable.filter(
      (image) => image.reviewStatus === "rejected",
    ).length,
    updatedAt: Date.now(),
  };
  await ctx.db.patch(jobId, patch);
  return patch;
}

export const list = query({
  args: {
    productId: v.optional(v.id("products")),
    status: jobStatusFilter,
    executionMode: executionModeFilter,
    provider: providerFilter,
    review: reviewFilter,
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(
      1,
      Math.min(Math.floor(args.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
    );
    const page: Doc<"generationJobs">[] = [];
    let matched = 0;
    const jobs = ctx.db
      .query("generationJobs")
      .withIndex("by_created")
      .order("desc");
    for await (const job of jobs) {
      if (job.isHidden) continue;
      if (!shopMatchesScope(job, scope)) continue;
      if (args.productId && !job.productIds.includes(args.productId)) continue;
      const effectiveExecutionMode = job.executionMode ?? "realtime";
      if (args.status && job.status !== args.status) continue;
      if (args.executionMode && effectiveExecutionMode !== args.executionMode)
        continue;
      if (args.provider && job.imageProvider !== args.provider) continue;
      if (args.review && getStoredReviewState(job) !== args.review) continue;
      if (matched >= offset && page.length < limit + 1) page.push(job);
      matched += 1;
      if (page.length >= limit + 1) break;
    }
    const pageJobs = await Promise.all(
      page.slice(0, limit).map(async (job) => {
        const images = await ctx.db
          .query("generatedImages")
          .withIndex("by_job", (q) => q.eq("jobId", job._id))
          .collect();
        return { ...job, ...executionPatchForJob(job, images) };
      }),
    );
    return {
      page: pageJobs.map(listedJob),
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: page.length > limit,
    };
  },
});

export const costSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const jobs = (await ctx.db.query("generationJobs").collect()).filter(
      (job: Doc<"generationJobs">) => !job.isHidden && shopMatchesScope(job, scope),
    );
    const products = (await ctx.db.query("products").collect()).filter(
      (product: Doc<"products">) => shopMatchesScope(product, scope),
    );
    const needsImageFallback = jobs.some(jobNeedsImageCostFallback);
    const images = needsImageFallback
      ? (await ctx.db.query("generatedImages").collect()).filter(
          (image: Doc<"generatedImages">) => shopMatchesScope(image, scope),
        )
      : [];
    const imagesByJob = new Map<
      Id<"generationJobs">,
      Doc<"generatedImages">[]
    >();
    for (const image of images) {
      imagesByJob.set(image.jobId, [
        ...(imagesByJob.get(image.jobId) ?? []),
        image,
      ]);
    }
    const costs = jobs.map((job) => ({
      job,
      cost: summarizeJobCostWithFallback(job, imagesByJob),
    }));
    const generationCost = costs.reduce(
      (sum, item) => sum + item.cost.generationCost,
      0,
    );
    const realtimeGenerationCost = costs
      .filter((item) => item.job.executionMode !== "batch")
      .reduce((sum, item) => sum + item.cost.generationCost, 0);
    const batchGenerationCost = costs
      .filter((item) => item.job.executionMode === "batch")
      .reduce((sum, item) => sum + item.cost.generationCost, 0);
    const inputTokens = costs.reduce(
      (sum, item) => sum + item.cost.inputTokens,
      0,
    );
    const outputTokens = costs.reduce(
      (sum, item) => sum + item.cost.outputTokens,
      0,
    );
    const analysisCost = products.reduce(
      (sum, product) => sum + (product.vibeCostUsd ?? 0),
      0,
    );
    return {
      generationCost,
      realtimeGenerationCost,
      batchGenerationCost,
      analysisCost,
      totalCost: generationCost + analysisCost,
      inputTokens,
      outputTokens,
      realtimeImageCount: costs
        .filter((item) => item.job.executionMode !== "batch")
        .reduce((sum, item) => sum + item.cost.pricedImageCount, 0),
      batchImageCount: costs
        .filter((item) => item.job.executionMode === "batch")
        .reduce((sum, item) => sum + item.cost.pricedImageCount, 0),
      pricedImageCount: costs.reduce(
        (sum, item) => sum + item.cost.pricedImageCount,
        0,
      ),
    };
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const job = await ctx.db.get(args.jobId);
    if (!job || !shopMatchesScope(job, scope)) return null;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
    const currentJob = { ...job, ...executionPatchForJob(job, images) };
    const products = await Promise.all(
      job.productIds.map((id) => ctx.db.get(id)),
    );
    return { job: currentJob, images, products: products.filter(Boolean) };
  },
});

export const create = mutation({
  args: {
    productIds: v.array(v.id("products")),
    selectedImageTypes: v.array(v.string()),
    forceRegenerate: v.boolean(),
    useVibeAnalysis: v.optional(v.boolean()),
    regenerationInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    if (!args.productIds.length) throw new Error("Select at least one product.");
    if (!args.selectedImageTypes.length)
      throw new Error("Select at least one image type.");
    if (
      args.regenerationInstructions &&
      args.regenerationInstructions.trim().length > 2000
    ) {
      throw new Error(
        "Regeneration instructions must be 2000 characters or fewer.",
      );
    }

    const products = (
      await Promise.all(args.productIds.map((id) => ctx.db.get(id)))
    ).filter(Boolean) as Doc<"products">[];
    if (!products.length) throw new Error("No products found.");
    if (products.some((product) => !shopMatchesScope(product, scope))) {
      throw new Error("Selected products must belong to the active shop.");
    }
    await Promise.all(
      products
        .filter((product) => !product.shopId)
        .map((product) =>
          ctx.db.patch(product._id, {
            shopId: shop._id,
            updatedAt: Date.now(),
          }),
        ),
    );

    const { imageProvider, executionMode, imageModel, vibeAnalysisDefault } =
      await currentGenerationEngine(ctx, scope);
  const vibeAnalysis = args.useVibeAnalysis ?? vibeAnalysisDefault;
  const prompts = await promptsForScope(ctx, scope);
  const promptSettings = await promptSettingsForScope(ctx, scope);
  const modelReferences = sanitizeModelReferences(promptSettings?.modelReferences);
  const { planned, selectedImageTypes } = buildImageTasks({
    products,
    prompts,
    promptSettings,
    modelReferences,
    selectedImageTypes: args.selectedImageTypes,
    regenerationInstructions: args.regenerationInstructions,
  });
    const now = Date.now();

    const jobId = await ctx.db.insert("generationJobs", {
      shopId: shop._id,
      status: "queued",
      mode: products.length === 1 ? "single" : "bulk",
      executionMode,
      batchId: null,
      previousBatchIds: [],
      batchStatus: null,
      batchInputFileName: null,
      batchIngestionStartedAt: null,
      batchResultOffset: 0,
      vibeAnalysis,
      imageProvider,
      imageModel,
      productIds: products.map((product) => product._id),
      selectedImageTypes,
      forceRegenerate: args.forceRegenerate,
      totalTasks: planned.length,
      completedTasks: 0,
      failedTasks: 0,
      generationCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      pricedImageCount: 0,
      reviewTotal: 0,
      reviewPending: 0,
      reviewApproved: 0,
      reviewRejected: 0,
      error: null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    for (const task of planned) {
      await ctx.db.insert("generatedImages", {
        shopId: shop._id,
        productId: task.product._id,
        jobId,
        imageType: task.imageType,
        imageProvider,
        imageModel,
      promptUsed: task.promptUsed,
      finalPromptUsed: task.promptUsed,
      promptKind: task.promptKind,
      modelReferenceKey: task.modelReferenceKey,
      modelReferenceStorageId: task.modelReferenceStorageId,
      modelReferenceUrl: task.modelReferenceUrl,
        useVibeAnalysis: task.useVibeAnalysis,
        vibeUsed: null,
        referenceImageCount: task.referenceImageCount,
        sourceImageUrls: task.sourceImageUrls,
        sourceImageUrl: task.sourceImageUrl,
        sourceImageUrl2: task.sourceImageUrl2,
        ...task.background,
        generatedImageUrl: null,
        storageUrl: null,
        transparentCutoutUrl: null,
        backgroundRemovalRequestId: null,
        status: "queued",
        reviewStatus: "pending",
        shopifyMediaId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(task.product._id, {
        generationStatus: "generating",
        generationState: "generating",
        primaryAction: "wait",
        latestJobId: jobId,
        updatedAt: now,
      });
    }

    await refreshJobSummary(ctx, jobId);
    for (const product of products) {
      await refreshProductSummary(ctx, product._id);
    }

    await ctx.scheduler.runAfter(
      0,
      executionMode === "batch"
        ? internal.generation.submitBatch
        : internal.generation.processJob,
      { jobId },
    );
    return jobId;
  },
});

export const cancel = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await cancelJobLocally(ctx, {
      jobId: args.jobId,
      reason: "Job cancelled by user.",
    });
  },
});

async function cancelJobLocally(
  ctx: { db: any },
  args: {
    jobId: Id<"generationJobs">;
    reason: string;
    batchStatus?: string | null;
  },
) {
  const job = await ctx.db.get(args.jobId);
  if (!job) throw new Error("Job not found.");
  if (isTerminalJobStatus(job.status)) return;
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_job", (q: any) => q.eq("jobId", args.jobId))
    .collect();
  const now = Date.now();
  for (const image of images) {
    if (isActiveImageStatus(image.status)) {
      await ctx.db.patch(
        image._id,
        cancelImagePatch({ image, job, reason: args.reason, now }),
      );
    }
  }
  await ctx.db.patch(args.jobId, {
    status: "cancelled",
    batchStatus: args.batchStatus ?? job.batchStatus ?? null,
    error: args.reason,
    batchIngestionStartedAt: null,
    updatedAt: now,
    completedAt: now,
  });
  await refreshJobSummary(ctx, args.jobId);
  for (const productId of job.productIds as Id<"products">[]) {
    await refreshProductSummary(ctx, productId);
  }
}

export const markRunning = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "cancelled") return false;
    await ctx.db.patch(args.jobId, {
      status: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const nextQueuedImage = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "cancelled") return null;
    return ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "queued"))
      .first();
  },
});

export const getJobInternal = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  },
});

export const imagesForJob = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const setBatchInfo = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    batchId: v.union(v.string(), v.null()),
    batchStatus: v.optional(v.union(v.string(), v.null())),
    batchInputFileName: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      batchId: args.batchId,
      batchStatus: args.batchStatus ?? null,
      batchInputFileName: args.batchInputFileName ?? null,
      batchIngestionStartedAt: null,
      batchResultOffset: 0,
      updatedAt: Date.now(),
    });
  },
});

export const setBatchStatus = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    batchStatus: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      batchStatus: args.batchStatus,
      updatedAt: Date.now(),
    });
  },
});

export const cancelInternal = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    reason: v.string(),
    batchStatus: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await cancelJobLocally(ctx, args);
  },
});

export const markImagesGenerating = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "queued"))
      .collect();
    const now = Date.now();
    for (const image of images) {
      await ctx.db.patch(image._id, {
        status: "generating",
        providerBatchId: args.providerBatchId,
        updatedAt: now,
      });
    }
  },
});

function isTerminalBatchSegmentStatus(
  status: Doc<"generationBatchSegments">["status"],
) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export const markBatchSubmitStarted = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "cancelled") return false;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      batchSubmitStartedAt: job.batchSubmitStartedAt ?? now,
      updatedAt: now,
    });
    return true;
  },
});

export const markAllBatchesSubmitted = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "cancelled") return false;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      allBatchesSubmittedAt: job.allBatchesSubmittedAt ?? now,
      updatedAt: now,
    });
    return true;
  },
});

export const markFirstResultReady = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.firstResultReadyAt) return false;
    await ctx.db.patch(args.jobId, {
      firstResultReadyAt: Date.now(),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const createBatchSegment = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    provider: v.union(v.literal("openai"), v.literal("gemini")),
    imageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("generationBatchSegments", {
      jobId: args.jobId,
      provider: args.provider,
      batchId: null,
      inputFileName: null,
      batchStatus: null,
      status: "submitting",
      imageCount: args.imageCount,
      ingestedCount: 0,
      failedCount: 0,
      resultOffset: 0,
      ingestionStartedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setBatchSegmentSubmitted = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    batchId: v.string(),
    inputFileName: v.optional(v.union(v.string(), v.null())),
    batchStatus: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return false;
    const job = await ctx.db.get(segment.jobId);
    const now = Date.now();
    await ctx.db.patch(args.segmentId, {
      batchId: args.batchId,
      inputFileName: args.inputFileName ?? null,
      batchStatus: args.batchStatus ?? null,
      status: "running",
      submittedAt: now,
      updatedAt: now,
    });
    if (job && !job.batchId) {
      await ctx.db.patch(job._id, {
        batchId: args.batchId,
        batchStatus: args.batchStatus ?? null,
        batchInputFileName: args.inputFileName ?? null,
        updatedAt: now,
      });
    }
    return true;
  },
});

export const setBatchSegmentStatus = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    status: v.union(
      v.literal("submitting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    batchStatus: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    ingestedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return false;
    const now = Date.now();
    await ctx.db.patch(args.segmentId, {
      status: args.status,
      batchStatus: args.batchStatus ?? segment.batchStatus ?? null,
      error: args.error ?? null,
      ingestedCount: args.ingestedCount ?? segment.ingestedCount ?? 0,
      failedCount: args.failedCount ?? segment.failedCount ?? 0,
      providerDoneAt: isTerminalBatchSegmentStatus(args.status)
        ? (segment.providerDoneAt ?? now)
        : segment.providerDoneAt,
      ingestionCompletedAt:
        args.status === "completed" || args.status === "failed"
          ? (segment.ingestionCompletedAt ?? now)
          : segment.ingestionCompletedAt,
      ingestionStartedAt: isTerminalBatchSegmentStatus(args.status)
        ? null
        : segment.ingestionStartedAt,
      updatedAt: now,
    });
    return true;
  },
});

export const setBatchSegmentResultOffset = internalMutation({
  args: { segmentId: v.id("generationBatchSegments"), offset: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.segmentId, {
      resultOffset: args.offset,
      updatedAt: Date.now(),
    });
  },
});

export const acquireBatchSegmentIngestion = internalMutation({
  args: { segmentId: v.id("generationBatchSegments") },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment || segment.status !== "running") return false;
    const now = Date.now();
    if (
      segment.ingestionStartedAt &&
      now - segment.ingestionStartedAt < BATCH_INGESTION_LEASE_MS
    )
      return false;
    await ctx.db.patch(args.segmentId, {
      ingestionStartedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const releaseBatchSegmentIngestion = internalMutation({
  args: { segmentId: v.id("generationBatchSegments") },
  handler: async (ctx, args) => {
    const segment = await ctx.db.get(args.segmentId);
    if (!segment) return;
    await ctx.db.patch(args.segmentId, {
      ingestionStartedAt: null,
      updatedAt: Date.now(),
    });
  },
});

export const batchSegmentsForJob = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const batchSegmentInternal = internalQuery({
  args: { segmentId: v.id("generationBatchSegments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.segmentId);
  },
});

export const pendingBatchSegments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const submitting = await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_status", (q) => q.eq("status", "submitting"))
      .collect();
    const running = await ctx.db
      .query("generationBatchSegments")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    return [...submitting, ...running];
  },
});

export const markSegmentImagesGenerating = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    imageIds: v.array(v.id("generatedImages")),
    providerBatchId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const imageId of args.imageIds) {
      const image = await ctx.db.get(imageId);
      if (!image || image.status !== "queued") continue;
      await ctx.db.patch(imageId, {
        status: "generating",
        batchSegmentId: args.segmentId,
        providerBatchId: args.providerBatchId,
        updatedAt: now,
      });
    }
  },
});

export const assignImagesToBatchSegment = internalMutation({
  args: {
    segmentId: v.id("generationBatchSegments"),
    imageIds: v.array(v.id("generatedImages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const imageId of args.imageIds) {
      const image = await ctx.db.get(imageId);
      if (!image || image.status !== "queued") continue;
      await ctx.db.patch(imageId, {
        batchSegmentId: args.segmentId,
        updatedAt: now,
      });
    }
  },
});

export const imagesForBatchSegment = internalQuery({
  args: {
    segmentId: v.id("generationBatchSegments"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generatedImages")
      .withIndex("by_batch_segment", (q) =>
        q.eq("batchSegmentId", args.segmentId),
      )
      .collect();
  },
});

export const pendingBatchJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    return running.filter((job) => job.executionMode === "batch");
  },
});

// Convex Node actions time out after 10 minutes. Keep a short buffer so a
// killed action releases naturally without allowing overlapping ingestion.
const BATCH_INGESTION_LEASE_MS = 11 * 60 * 1000;

export const acquireBatchIngestion = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return false;
    const now = Date.now();
    if (
      job.batchIngestionStartedAt &&
      now - job.batchIngestionStartedAt < BATCH_INGESTION_LEASE_MS
    )
      return false;
    await ctx.db.patch(args.jobId, {
      batchIngestionStartedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const releaseBatchIngestion = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    await ctx.db.patch(args.jobId, {
      batchIngestionStartedAt: null,
      updatedAt: Date.now(),
    });
  },
});

export const setBatchResultOffset = internalMutation({
  args: { jobId: v.id("generationJobs"), offset: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      batchResultOffset: args.offset,
      updatedAt: Date.now(),
    });
  },
});

export const completeImage = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    generatedImageUrl: v.string(),
    storageUrl: v.string(),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    transparentCutoutUrl: v.optional(v.union(v.string(), v.null())),
    backgroundRemovalProvider: v.optional(
      v.union(v.literal("fal_ideogram"), v.null()),
    ),
    backgroundRemovalCostUsd: v.optional(v.number()),
    backgroundRemovalRequestId: v.optional(v.union(v.string(), v.null())),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    costRateMultiplier: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (
      !image ||
      image.status === "generated" ||
      image.status === "uploaded" ||
      image.status === "failed" ||
      image.status === "canceled"
    )
      return { completed: false, cleanupUrls: [] } satisfies CompleteImageResult;
    if (image.retrySourceImageId) {
      const source = await ctx.db.get(image.retrySourceImageId);
      const uploadedUrls = uniqueUrls([
        args.generatedImageUrl,
        args.storageUrl,
        args.transparentCutoutUrl,
      ]);
      if (!source || source.activeRetryImageId !== image._id) {
        await ctx.db.patch(args.imageId, {
          status: "canceled",
          error: "Retry result ignored because a newer retry is active.",
          updatedAt: Date.now(),
        });
        const staleJob = await ctx.db.get(image.jobId);
        if (staleJob) {
          await ctx.db.patch(staleJob._id, {
            failedTasks: staleJob.failedTasks + 1,
            updatedAt: Date.now(),
          });
        }
        return { completed: false, cleanupUrls: uploadedUrls } satisfies CompleteImageResult;
      }

      const cleanupUrls = uniqueUrls([
        source.storageUrl,
        source.generatedImageUrl,
        source.backgroundRemovalInputUrl,
        source.postProcessingInputUrl,
        source.transparentCutoutUrl,
      ]).filter((url) => !uploadedUrls.includes(url));

      const now = Date.now();
      await ctx.db.patch(source._id, {
        imageProvider: image.imageProvider,
        imageModel: image.imageModel,
        promptUsed: image.promptUsed,
        finalPromptUsed: image.finalPromptUsed ?? image.promptUsed,
        promptKind: image.promptKind,
        modelReferenceKey: image.modelReferenceKey,
        modelReferenceStorageId: image.modelReferenceStorageId,
        modelReferenceUrl: image.modelReferenceUrl,
        useVibeAnalysis: image.useVibeAnalysis,
        vibeUsed: image.vibeUsed ?? null,
        referenceImageCount: image.referenceImageCount,
        sourceImageUrls: image.sourceImageUrls,
        sourceImageUrl: image.sourceImageUrl,
        sourceImageUrl2: image.sourceImageUrl2,
        removeBackground: image.removeBackground,
        backgroundMode: image.backgroundMode,
        backgroundColor: image.backgroundColor,
        backgroundShadow: image.backgroundShadow,
        generatedImageUrl: args.generatedImageUrl,
        storageUrl: args.storageUrl,
        transparentCutoutUrl: args.transparentCutoutUrl,
        retouchSourceImageId: null,
        retouchTool: null,
        retouchedAt: undefined,
        retouchedByUserId: undefined,
        backgroundRemovalInputUrl: null,
        backgroundRemovalInputContentType: null,
        backgroundRemovalInputExtension: null,
        backgroundRemovalProvider: args.backgroundRemovalProvider,
        backgroundRemovalCostUsd: args.backgroundRemovalCostUsd,
        backgroundRemovalRequestId: args.backgroundRemovalRequestId,
        postProcessingInputUrl: null,
        postProcessingInputContentType: null,
        postProcessingInputExtension: null,
        postProcessingStartedAt: null,
        batchSegmentId: null,
        providerBatchId: args.providerBatchId,
        providerRequestId: args.providerRequestId,
        providerResponseId: args.providerResponseId,
        status: "generated",
        reviewStatus: "pending",
        reviewedAt: undefined,
        reviewedByUserId: undefined,
        shopifyMediaId: null,
        error: null,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costUsd: args.costUsd,
        costRateMultiplier: args.costRateMultiplier,
        activeRetryImageId: null,
        retryError: null,
        updatedAt: now,
      });

      const job = await ctx.db.get(image.jobId);
      if (job) {
        await ctx.db.patch(job._id, {
          completedTasks: job.completedTasks + 1,
          firstImageStoredAt: job.firstImageStoredAt ?? now,
          updatedAt: now,
        });
      }
      if (source.status === "failed" || source.status === "canceled") {
        const sourceJob = await ctx.db.get(source.jobId);
        if (sourceJob) {
          const completedTasks = Math.min(
            sourceJob.totalTasks,
            sourceJob.completedTasks + 1,
          );
          const failedTasks = Math.max(0, sourceJob.failedTasks - 1);
          const done = completedTasks + failedTasks >= sourceJob.totalTasks;
          await ctx.db.patch(sourceJob._id, {
            completedTasks,
            failedTasks,
            status: done
              ? failedTasks > 0
                ? "failed"
                : "completed"
              : sourceJob.status === "failed" || sourceJob.status === "cancelled"
                ? "running"
                : sourceJob.status,
            error:
              failedTasks > 0 ? `${failedTasks} image task(s) failed.` : null,
            completedAt: done ? now : undefined,
            firstImageStoredAt: sourceJob.firstImageStoredAt ?? now,
            updatedAt: now,
          });
        }
      }
      await ctx.db.delete(image._id);
      await refreshJobSummary(ctx, source.jobId);
      await refreshJobSummary(ctx, image.jobId);
      await refreshProductSummary(ctx, source.productId);
      return { completed: true, cleanupUrls } satisfies CompleteImageResult;
    }
    await ctx.db.patch(args.imageId, {
      generatedImageUrl: args.generatedImageUrl,
      storageUrl: args.storageUrl,
      providerBatchId: args.providerBatchId,
      providerRequestId: args.providerRequestId,
      providerResponseId: args.providerResponseId,
      transparentCutoutUrl: args.transparentCutoutUrl,
      backgroundRemovalProvider: args.backgroundRemovalProvider,
      backgroundRemovalCostUsd: args.backgroundRemovalCostUsd,
    backgroundRemovalRequestId: args.backgroundRemovalRequestId,
    postProcessingInputUrl: null,
    postProcessingInputContentType: null,
    postProcessingInputExtension: null,
    postProcessingStartedAt: null,
    status: "generated",
      reviewStatus: "pending",
      reviewedAt: undefined,
      reviewedByUserId: undefined,
      error: null,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      costRateMultiplier: args.costRateMultiplier,
    updatedAt: Date.now(),
  });
  const job = await ctx.db.get(image.jobId);
  await ctx.db.patch(image.jobId, {
    completedTasks: (job?.completedTasks ?? 0) + 1,
    firstImageStoredAt: job?.firstImageStoredAt ?? Date.now(),
    updatedAt: Date.now(),
  });
    await refreshJobSummary(ctx, image.jobId);
    await refreshProductSummary(ctx, image.productId);
    return { completed: true, cleanupUrls: [] } satisfies CompleteImageResult;
  },
});

export const markImagePostprocessing = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    inputUrl: v.string(),
    inputContentType: v.string(),
    inputExtension: v.string(),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    costRateMultiplier: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (
      !image ||
      image.status === "generated" ||
      image.status === "uploaded" ||
      image.status === "failed" ||
      image.status === "canceled"
    )
      return false;
    await ctx.db.patch(args.imageId, {
      status: "postprocessing",
      postProcessingInputUrl: args.inputUrl,
      postProcessingInputContentType: args.inputContentType,
      postProcessingInputExtension: args.inputExtension,
      postProcessingStartedAt: null,
      providerBatchId: args.providerBatchId,
      providerRequestId: args.providerRequestId,
      providerResponseId: args.providerResponseId,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      costRateMultiplier: args.costRateMultiplier,
      error: null,
      updatedAt: Date.now(),
    });
    return true;
  },
});

const POSTPROCESSING_LEASE_MS = 11 * 60 * 1000;

export const claimPostprocessingImages = internalMutation({
  args: { jobId: v.id("generationJobs"), limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", args.jobId).eq("status", "postprocessing"),
      )
      .take(Math.max(1, args.limit * 4));
    const claimed: Doc<"generatedImages">[] = [];
    for (const image of images) {
      if (claimed.length >= args.limit) break;
      if (
        image.postProcessingStartedAt &&
        now - image.postProcessingStartedAt < POSTPROCESSING_LEASE_MS
      )
        continue;
      await ctx.db.patch(image._id, {
        postProcessingStartedAt: now,
        updatedAt: now,
      });
      claimed.push({ ...image, postProcessingStartedAt: now });
    }
    return claimed;
  },
});

export const pendingPostprocessingJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_status", (q) => q.eq("status", "postprocessing"))
      .take(100);
    return Array.from(new Set(images.map((image) => image.jobId)));
  },
});

export const markBackgroundRemovalStaged = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    inputUrl: v.string(),
    inputContentType: v.string(),
    inputExtension: v.string(),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    costRateMultiplier: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (
      !image ||
      image.status === "generated" ||
      image.status === "uploaded" ||
      image.status === "canceled"
    )
      return false;
    await ctx.db.patch(args.imageId, {
      backgroundRemovalInputUrl: args.inputUrl,
      backgroundRemovalInputContentType: args.inputContentType,
      backgroundRemovalInputExtension: args.inputExtension,
      providerBatchId: args.providerBatchId,
      providerRequestId: args.providerRequestId,
      providerResponseId: args.providerResponseId,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      costRateMultiplier: args.costRateMultiplier,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const failImage = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    error: v.string(),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    backgroundRemovalRequestId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (
      !image ||
      image.status === "generated" ||
      image.status === "uploaded" ||
      image.status === "failed" ||
      image.status === "canceled"
    )
      return false;
    const job = await ctx.db.get(image.jobId);
    if (image.retrySourceImageId) {
      const source = await ctx.db.get(image.retrySourceImageId);
      if (source?.activeRetryImageId === image._id) {
        await ctx.db.patch(source._id, {
          activeRetryImageId: null,
          retryError: args.error,
          ...(source.status === "failed" || source.status === "canceled"
            ? { error: args.error }
            : {}),
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.patch(args.imageId, {
      status: "failed",
      error: args.error,
      providerBatchId: args.providerBatchId,
      providerRequestId: args.providerRequestId,
      providerResponseId: args.providerResponseId,
      backgroundRemovalRequestId: args.backgroundRemovalRequestId,
      updatedAt: Date.now(),
    });
    if (job) {
      await ctx.db.patch(job._id, {
        failedTasks: job.failedTasks + 1,
        updatedAt: Date.now(),
      });
      await refreshJobSummary(ctx, job._id);
    }
    await refreshProductSummary(ctx, image.productId);
    return true;
  },
});

export const markImageGenerating = internalMutation({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, {
      status: "generating",
      updatedAt: Date.now(),
    });
  },
});

export const markImagePromptPrepared = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    finalPromptUsed: v.string(),
    vibeUsed: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, {
      finalPromptUsed: args.finalPromptUsed,
      vibeUsed: args.vibeUsed ?? null,
      updatedAt: Date.now(),
    });
  },
});

export const generateRetouchUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await ensureActiveShop(ctx, userId);
    return ctx.storage.generateUploadUrl();
  },
});

export const retouchSourceForSave = internalQuery({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const image = await ctx.db.get(args.imageId);
    if (
      !image ||
      !shopMatchesScope(image, scope) ||
      !image.storageUrl ||
      (image.status !== "generated" && image.status !== "uploaded")
    ) {
      return null;
    }
    return image;
  },
});

export const insertRetouchedImage = internalMutation({
  args: {
    sourceImageId: v.id("generatedImages"),
    storageUrl: v.string(),
    saveMode: v.optional(v.union(v.literal("version"), v.literal("overwrite"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const source = await ctx.db.get(args.sourceImageId);
    if (
      !source ||
      !shopMatchesScope(source, scope) ||
      !source.storageUrl ||
      (source.status !== "generated" && source.status !== "uploaded")
    ) {
      throw new Error("Source image not found.");
    }
    if (!args.storageUrl.startsWith("http")) {
      throw new Error("Retouched image URL is invalid.");
    }

    const now = Date.now();
    if ((args.saveMode ?? "version") === "overwrite") {
      await ctx.db.patch(source._id, {
        generatedImageUrl: args.storageUrl,
        storageUrl: args.storageUrl,
        retouchSourceImageId: source.retouchSourceImageId ?? source._id,
        retouchTool: "manual_brush",
        retouchedAt: now,
        retouchedByUserId: userId,
        transparentCutoutUrl: null,
        status: "generated",
        reviewStatus: "pending",
        reviewedAt: undefined,
        reviewedByUserId: undefined,
        shopifyMediaId: null,
        error: null,
        updatedAt: now,
      });
      await refreshJobSummary(ctx, source.jobId);
      await refreshProductSummary(ctx, source.productId);
      return source._id;
    }

    const imageId = await ctx.db.insert("generatedImages", {
      ...(source.shopId ? { shopId: source.shopId } : {}),
      productId: source.productId,
      jobId: source.jobId,
      imageType: source.imageType,
      ...(source.imageProvider ? { imageProvider: source.imageProvider } : {}),
      ...(source.imageModel !== undefined
        ? { imageModel: source.imageModel }
        : {}),
      promptUsed: source.promptUsed,
      finalPromptUsed: source.finalPromptUsed ?? source.promptUsed,
      ...(source.promptKind ? { promptKind: source.promptKind } : {}),
      ...(source.useVibeAnalysis !== undefined
        ? { useVibeAnalysis: source.useVibeAnalysis }
        : {}),
      ...(source.vibeUsed !== undefined ? { vibeUsed: source.vibeUsed } : {}),
      ...(source.referenceImageCount !== undefined
        ? { referenceImageCount: source.referenceImageCount }
        : {}),
      ...(source.sourceImageUrls !== undefined
        ? { sourceImageUrls: source.sourceImageUrls }
        : {}),
      ...(source.sourceImageUrl !== undefined
        ? { sourceImageUrl: source.sourceImageUrl }
        : {}),
      ...(source.sourceImageUrl2 !== undefined
        ? { sourceImageUrl2: source.sourceImageUrl2 }
        : {}),
      ...(source.modelReferenceKey !== undefined
        ? { modelReferenceKey: source.modelReferenceKey }
        : {}),
      ...(source.modelReferenceStorageId !== undefined
        ? { modelReferenceStorageId: source.modelReferenceStorageId }
        : {}),
      ...(source.modelReferenceUrl !== undefined
        ? { modelReferenceUrl: source.modelReferenceUrl }
        : {}),
      generatedImageUrl: args.storageUrl,
      storageUrl: args.storageUrl,
      retouchSourceImageId: source._id,
      retouchTool: "manual_brush",
      retouchedAt: now,
      retouchedByUserId: userId,
      ...(source.removeBackground !== undefined
        ? { removeBackground: source.removeBackground }
        : {}),
      ...(source.backgroundRemovalProvider !== undefined
        ? { backgroundRemovalProvider: source.backgroundRemovalProvider }
        : {}),
      ...(source.backgroundMode !== undefined
        ? { backgroundMode: source.backgroundMode }
        : {}),
      ...(source.backgroundColor !== undefined
        ? { backgroundColor: source.backgroundColor }
        : {}),
      ...(source.backgroundShadow !== undefined
        ? { backgroundShadow: source.backgroundShadow }
        : {}),
      transparentCutoutUrl: null,
      status: "generated",
      reviewStatus: "pending",
      shopifyMediaId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });

    await refreshJobSummary(ctx, source.jobId);
    await refreshProductSummary(ctx, source.productId);
    return imageId;
  },
});

export const reviewImages = mutation({
  args: {
    imageIds: v.array(v.id("generatedImages")),
    reviewStatus: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const now = Date.now();
    let updated = 0;
    const affectedProductIds = new Set<Id<"products">>();
    const affectedJobIds = new Set<Id<"generationJobs">>();
    for (const imageId of Array.from(new Set(args.imageIds))) {
      const image = await ctx.db.get(imageId);
      if (
        !image ||
        !shopMatchesScope(image, scope) ||
        !image.storageUrl ||
        (image.status !== "generated" && image.status !== "uploaded")
      )
        continue;
      await ctx.db.patch(imageId, {
        reviewStatus: args.reviewStatus,
        reviewedAt: now,
        reviewedByUserId: userId,
        updatedAt: now,
      });
      affectedProductIds.add(image.productId);
      affectedJobIds.add(image.jobId);
      updated += 1;
    }
    for (const jobId of affectedJobIds) {
      await refreshJobSummary(ctx, jobId);
    }
    for (const productId of affectedProductIds) {
      await refreshProductSummary(ctx, productId);
    }
    return { updated };
  },
});

export const regenerateImage = mutation({
  args: {
    imageId: v.id("generatedImages"),
    regenerationInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const image = await ctx.db.get(args.imageId);
    if (!image || !shopMatchesScope(image, scope)) {
      throw new Error("Image not found.");
    }
    if (isActiveImageStatus(image.status)) {
      throw new Error("Image regeneration is already in progress.");
    }
    if (
      image.status !== "generated" &&
      image.status !== "uploaded" &&
      image.status !== "failed" &&
      image.status !== "canceled"
    ) {
      throw new Error("Only completed or failed images can be regenerated.");
    }

    const instructions = args.regenerationInstructions?.trim();
    if (instructions && instructions.length > 2000) {
      throw new Error("Regeneration instructions must be 2000 characters or fewer.");
    }

    const job = await ctx.db.get(image.jobId);
    if (!job || !shopMatchesScope(job, scope)) {
      throw new Error("Job not found.");
    }
    if (image.activeRetryImageId) {
      const activeRetry = await ctx.db.get(image.activeRetryImageId);
      if (activeRetry && isActiveImageStatus(activeRetry.status)) {
        throw new Error("Image regeneration is already in progress.");
      }
    }
    const product = await ctx.db.get(image.productId);
    if (!product || !shopMatchesScope(product, scope)) {
      throw new Error("Product not found.");
    }

    const { imageProvider, imageModel, executionMode } = await currentGenerationEngine(
      ctx,
      scope,
    );
    const prompts = await promptsForScope(ctx, scope);
    const promptSettings = await promptSettingsForScope(ctx, scope);
    const modelReferences = sanitizeModelReferences(promptSettings?.modelReferences);
    const { planned } = buildImageTasks({
      products: [product],
      prompts,
      promptSettings,
      modelReferences,
      selectedImageTypes: [image.imageType],
      regenerationInstructions: instructions || undefined,
    });
    const task = planned[0];
    if (!task) {
      throw new Error("Image type is no longer available for generation.");
    }

    const now = Date.now();
    const effectiveExecutionMode = job.executionMode ?? executionMode;
    const effectiveImageProvider =
      image.imageProvider ?? job.imageProvider ?? imageProvider;
    const effectiveImageModel = image.imageModel ?? job.imageModel ?? imageModel;
    const retryShopId = image.shopId ?? job.shopId;
    const retryJobId = await ctx.db.insert("generationJobs", {
      ...(retryShopId ? { shopId: retryShopId } : {}),
      status: "queued",
      mode: "single",
      executionMode: effectiveExecutionMode,
      batchId: null,
      previousBatchIds: [],
      batchStatus: null,
      batchInputFileName: null,
      batchIngestionStartedAt: null,
      batchResultOffset: 0,
      vibeAnalysis: task.useVibeAnalysis,
      imageProvider: effectiveImageProvider,
      imageModel: effectiveImageModel,
      productIds: [product._id],
      selectedImageTypes: [image.imageType],
      forceRegenerate: true,
      totalTasks: 1,
      completedTasks: 0,
      failedTasks: 0,
      generationCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      pricedImageCount: 0,
      reviewTotal: 0,
      reviewPending: 0,
      reviewApproved: 0,
      reviewRejected: 0,
      error: null,
      isHidden: true,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    const retryImageId = await ctx.db.insert("generatedImages", {
      ...(retryShopId ? { shopId: retryShopId } : {}),
      productId: product._id,
      jobId: retryJobId,
      imageType: image.imageType,
      imageProvider: effectiveImageProvider,
      imageModel: effectiveImageModel,
      promptUsed: task.promptUsed,
      finalPromptUsed: task.promptUsed,
      promptKind: task.promptKind,
      modelReferenceKey: task.modelReferenceKey,
      modelReferenceStorageId: task.modelReferenceStorageId,
      modelReferenceUrl: task.modelReferenceUrl,
      useVibeAnalysis: task.useVibeAnalysis,
      vibeUsed: null,
      referenceImageCount: task.referenceImageCount,
      sourceImageUrls: task.sourceImageUrls,
      sourceImageUrl: task.sourceImageUrl,
      sourceImageUrl2: task.sourceImageUrl2,
      ...task.background,
      generatedImageUrl: null,
      storageUrl: null,
      transparentCutoutUrl: null,
      retouchSourceImageId: null,
      retouchTool: null,
      retouchedAt: undefined,
      retouchedByUserId: undefined,
      backgroundRemovalInputUrl: null,
      backgroundRemovalInputContentType: null,
      backgroundRemovalInputExtension: null,
      backgroundRemovalCostUsd: undefined,
      backgroundRemovalRequestId: null,
      postProcessingInputUrl: null,
      postProcessingInputContentType: null,
      postProcessingInputExtension: null,
      postProcessingStartedAt: null,
      batchSegmentId: null,
      providerBatchId: null,
      providerRequestId: null,
      providerResponseId: null,
      retrySourceImageId: image._id,
      activeRetryImageId: null,
      retryError: null,
      status: "queued",
      reviewStatus: "pending",
      reviewedAt: undefined,
      reviewedByUserId: undefined,
      shopifyMediaId: null,
      error: null,
      inputTokens: undefined,
      outputTokens: undefined,
      costUsd: undefined,
      costRateMultiplier: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(image._id, {
      activeRetryImageId: retryImageId,
      retryError: null,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      effectiveExecutionMode === "batch"
        ? internal.generation.submitBatch
        : internal.generation.processJob,
      { jobId: retryJobId },
    );

    return retryJobId;

  },
});

export const retry = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const job = await ctx.db.get(args.jobId);
    if (!job || !shopMatchesScope(job, scope))
      throw new Error("Job not found.");
    if (job.status !== "failed" && job.status !== "cancelled")
      throw new Error("Only failed or cancelled jobs can be retried.");

    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const toRetry = images.filter((img) => isRetryableImageStatus(img.status));
    if (!toRetry.length) throw new Error("No failed images to retry.");
    const canResumePostProcessing = canResumeBackgroundRemoval(toRetry);

  const now = Date.now();
  const affectedProductIds = new Set<Id<"products">>();
  const affectedJobIds = new Set<Id<"generationJobs">>([args.jobId]);
  const existingSegments = await ctx.db
    .query("generationBatchSegments")
    .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
    .collect();
  for (const segment of existingSegments) {
    if (isTerminalBatchSegmentStatus(segment.status)) continue;
    await ctx.db.patch(segment._id, {
      status: "cancelled",
      ingestionStartedAt: null,
      updatedAt: now,
    });
  }

    // Cancel any stuck images from OTHER jobs on the same products so they
    // don't show as phantom "generating"/"queued" entries on the product page.
    const retryImageTypes = new Set(toRetry.map((img) => img.imageType));
    for (const productId of job.productIds as Id<"products">[]) {
      const otherImages = await ctx.db
        .query("generatedImages")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect();
      for (const img of otherImages) {
        if (img.jobId === args.jobId) continue;
        if (!retryImageTypes.has(img.imageType)) continue;
        if (isActiveImageStatus(img.status)) {
          await ctx.db.patch(img._id, supersedeImagePatch(now));
          affectedProductIds.add(img.productId);
          affectedJobIds.add(img.jobId);
        }
      }
    }

    for (const img of toRetry) {
      await ctx.db.patch(img._id, retryImagePatch(now));
      await ctx.db.patch(img.productId, generatingProductPatch(now));
      affectedProductIds.add(img.productId);
    }

    const kept = images.filter(
      (img) => img.status === "generated" || img.status === "uploaded",
    );
  const previousBatchIds = Array.from(
    new Set([
      ...(job.previousBatchIds ?? []),
      ...(job.batchId ? [job.batchId] : []),
      ...existingSegments
        .map((segment) => segment.batchId)
        .filter((batchId): batchId is string => Boolean(batchId)),
    ]),
  );
  await ctx.db.patch(args.jobId, {
    status: "queued",
    batchId: null,
    previousBatchIds,
    batchStatus: null,
    batchInputFileName: null,
    batchIngestionStartedAt: null,
    batchResultOffset: 0,
    batchSubmitStartedAt: undefined,
    allBatchesSubmittedAt: undefined,
    firstResultReadyAt: undefined,
    firstImageStoredAt: undefined,
    error: null,
      totalTasks: toRetry.length + kept.length,
      failedTasks: 0,
      completedTasks: kept.length,
      completedAt: undefined,
      updatedAt: now,
    });

    for (const jobId of affectedJobIds) {
      await refreshJobSummary(ctx, jobId);
    }
    for (const productId of affectedProductIds) {
      await refreshProductSummary(ctx, productId);
    }

    await ctx.scheduler.runAfter(
      0,
      job.executionMode === "batch" && !canResumePostProcessing
        ? internal.generation.submitBatch
        : internal.generation.processJob,
      { jobId: args.jobId },
    );
  },
});

export const failStuckJob = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
    const stuck = images.filter((img) => isActiveImageStatus(img.status));
    const now = Date.now();
    for (const img of stuck) {
      await ctx.db.patch(img._id, {
        status: "failed",
        error: args.error,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      failedTasks: job.failedTasks + stuck.length,
      completedAt: now,
      updatedAt: now,
    });
    await refreshJobSummary(ctx, args.jobId);
    for (const productId of job.productIds as Id<"products">[]) {
      await refreshProductSummary(ctx, productId);
    }
  },
});

export const finishJobIfDone = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;
    if (job.status === "cancelled") return false;
    const done = job.completedTasks + job.failedTasks >= job.totalTasks;
    if (!done) return false;
    const status = job.failedTasks > 0 ? "failed" : "completed";
    await ctx.db.patch(args.jobId, {
      status,
      error:
        job.failedTasks > 0 ? `${job.failedTasks} image task(s) failed.` : null,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await refreshJobSummary(ctx, args.jobId);

    for (const productId of job.productIds as Id<"products">[]) {
      await refreshProductSummary(ctx, productId);
    }
    return true;
  },
});

export const backfillJobSummaries = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const jobs = await ctx.db.query("generationJobs").collect();
    for (const job of jobs) {
      await refreshJobSummary(ctx, job._id);
    }
    return { jobs: jobs.length };
  },
});
