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
import { refreshProductSummary } from "./products";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
} from "./shopScope";

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
  const patch = {
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
    return {
      page: page.slice(0, limit).map(listedJob),
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
      (job: Doc<"generationJobs">) => shopMatchesScope(job, scope),
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
    const products = await Promise.all(
      job.productIds.map((id) => ctx.db.get(id)),
    );
    return { job, images, products: products.filter(Boolean) };
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
    const { planned, selectedImageTypes } = buildImageTasks({
      products,
      prompts,
      promptSettings,
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
      return false;
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
    await ctx.db.patch(image.jobId, {
      completedTasks: (await ctx.db.get(image.jobId))!.completedTasks + 1,
      updatedAt: Date.now(),
    });
    await refreshJobSummary(ctx, image.jobId);
    await refreshProductSummary(ctx, image.productId);
    return true;
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
    const previousBatchIds = job.batchId
      ? Array.from(new Set([...(job.previousBatchIds ?? []), job.batchId]))
      : (job.previousBatchIds ?? []);
    await ctx.db.patch(args.jobId, {
      status: "queued",
      batchId: null,
      previousBatchIds,
      batchStatus: null,
      batchInputFileName: null,
      batchIngestionStartedAt: null,
      batchResultOffset: 0,
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
