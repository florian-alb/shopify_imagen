import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { renderPrompt } from "./lib";
import { BATCH_PRICE_MULTIPLIER } from "./pricing";
import { refreshProductSummary } from "./products";

type ImageProvider = "openai" | "gemini";
type ExecutionMode = "realtime" | "batch";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const jobStatusFilter = v.optional(
  v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
);
const executionModeFilter = v.optional(v.union(v.literal("realtime"), v.literal("batch")));
const providerFilter = v.optional(v.union(v.literal("openai"), v.literal("gemini")));
const reviewFilter = v.optional(
  v.union(
    v.literal("to-review"),
    v.literal("approved"),
    v.literal("partial"),
    v.literal("rejected"),
    v.literal("no-review"),
  ),
);

function appendRegenerationInstructions(prompt: string, instructions?: string) {
  const correction = instructions?.trim();
  if (!correction) return prompt;
  return `${prompt}

IMPORTANT CORRECTION FOR THIS REGENERATION:
${correction}

Apply this correction with priority while preserving all other product details from the reference image and the instructions above.`;
}

// Reference images for a product, in priority order, de-duplicated.
// First entry feeds the primary reference, the second (if any) is passed as a
// staging/context reference alongside the prompt.
function referenceImageUrls(product: Doc<"products">): string[] {
  const candidates = [
    product.featuredImageUrl,
    ...product.currentShopifyImages.map(
      (image) => (image as { url?: string } | null)?.url,
    ),
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  return Array.from(new Set(candidates));
}

function imageCostForJob(
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
) {
  const cost = image.costUsd ?? 0;
  if (job.executionMode === "batch" && image.costRateMultiplier == null)
    return cost * BATCH_PRICE_MULTIPLIER;
  return cost;
}

function summarizeImageCosts(
  job: Doc<"generationJobs">,
  images: Doc<"generatedImages">[],
) {
  return {
    generationCost: images.reduce(
      (sum, image) => sum + imageCostForJob(job, image),
      0,
    ),
    inputTokens: images.reduce(
      (sum, image) => sum + (image.inputTokens ?? 0),
      0,
    ),
    outputTokens: images.reduce(
      (sum, image) => sum + (image.outputTokens ?? 0),
      0,
    ),
    pricedImageCount: images.filter((image) => image.costUsd != null).length,
  };
}

function storedJobCostSummary(job: Doc<"generationJobs">) {
  return {
    generationCost: job.generationCost ?? 0,
    inputTokens: job.inputTokens ?? 0,
    outputTokens: job.outputTokens ?? 0,
    pricedImageCount: job.pricedImageCount ?? 0,
  };
}

function storedJobReviewSummary(job: Doc<"generationJobs">) {
  return {
    total: job.reviewTotal ?? 0,
    pending: job.reviewPending ?? 0,
    approved: job.reviewApproved ?? 0,
    rejected: job.reviewRejected ?? 0,
  };
}

function getStoredReviewState(job: Doc<"generationJobs">) {
  const total = job.reviewTotal ?? 0;
  const pending = job.reviewPending ?? 0;
  const approved = job.reviewApproved ?? 0;
  const rejected = job.reviewRejected ?? 0;
  if (total === 0) return "no-review";
  if (pending > 0) return "to-review";
  if (rejected === total) return "rejected";
  if (approved === total) return "approved";
  return "partial";
}

function listedJob(job: Doc<"generationJobs">) {
  return {
    ...job,
    costSummary: storedJobCostSummary(job),
    reviewSummary: storedJobReviewSummary(job),
  };
}

export async function refreshJobSummary(ctx: { db: any }, jobId: Id<"generationJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) return null;
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_job", (q: any) => q.eq("jobId", jobId))
    .collect();
  const costSummary = summarizeImageCosts(job, images);
  const reviewable: Doc<"generatedImages">[] = images.filter(
    (image: Doc<"generatedImages">) => image.storageUrl && (image.status === "generated" || image.status === "uploaded"),
  );
  const patch = {
    generationCost: costSummary.generationCost,
    inputTokens: costSummary.inputTokens,
    outputTokens: costSummary.outputTokens,
    pricedImageCount: costSummary.pricedImageCount,
    reviewTotal: reviewable.length,
    reviewPending: reviewable.filter((image) => (image.reviewStatus ?? "pending") === "pending").length,
    reviewApproved: reviewable.filter((image) => image.reviewStatus === "approved").length,
    reviewRejected: reviewable.filter((image) => image.reviewStatus === "rejected").length,
    updatedAt: Date.now(),
  };
  await ctx.db.patch(jobId, patch);
  return patch;
}

async function currentGenerationEngine(ctx: MutationCtx) {
  const rows = await ctx.db.query("appSettings").collect();
  const settings = Object.fromEntries(
    rows.map((row: Doc<"appSettings">) => [row.key, row.value]),
  );
  const imageProvider: ImageProvider =
    settings.IMAGE_PROVIDER === "gemini" ? "gemini" : "openai";
  const executionMode: ExecutionMode =
    settings.GENERATION_EXECUTION_MODE === "batch" ? "batch" : "realtime";
  const imageModel =
    imageProvider === "gemini"
      ? String(settings.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview")
      : String(settings.OPENAI_IMAGE_MODEL ?? "gpt-image-2-2026-04-21");
  const vibeAnalysisDefault = String(settings.VIBE_ANALYSIS ?? "on") !== "off";
  return { imageProvider, executionMode, imageModel, vibeAnalysisDefault };
}

export const list = query({
  args: {
    status: jobStatusFilter,
    executionMode: executionModeFilter,
    provider: providerFilter,
    review: reviewFilter,
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE));
    const page: Doc<"generationJobs">[] = [];
    let matched = 0;
    const jobs = ctx.db
      .query("generationJobs")
      .withIndex("by_created")
      .order("desc");
    for await (const job of jobs) {
      const effectiveExecutionMode = job.executionMode ?? "realtime";
      if (args.status && job.status !== args.status) continue;
      if (args.executionMode && effectiveExecutionMode !== args.executionMode) continue;
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
    await requireUserId(ctx);
    const jobs = await ctx.db.query("generationJobs").collect();
    const products = await ctx.db.query("products").collect();
    const needsImageFallback = jobs.some(
      (job) =>
        job.generationCost == null ||
        job.inputTokens == null ||
        job.outputTokens == null ||
        job.pricedImageCount == null,
    );
    const images = needsImageFallback
      ? await ctx.db.query("generatedImages").collect()
      : [];
    const imagesByJob = new Map<Id<"generationJobs">, Doc<"generatedImages">[]>();
    for (const image of images) {
      imagesByJob.set(image.jobId, [...(imagesByJob.get(image.jobId) ?? []), image]);
    }
    const jobCost = (job: Doc<"generationJobs">) => {
      if (
        job.generationCost != null &&
        job.inputTokens != null &&
        job.outputTokens != null &&
        job.pricedImageCount != null
      ) {
        return {
          generationCost: job.generationCost,
          inputTokens: job.inputTokens,
          outputTokens: job.outputTokens,
          pricedImageCount: job.pricedImageCount,
        };
      }
      return summarizeImageCosts(job, imagesByJob.get(job._id) ?? []);
    };
    const costs = jobs.map((job) => ({ job, cost: jobCost(job) }));
    const generationCost = costs.reduce((sum, item) => sum + item.cost.generationCost, 0);
    const realtimeGenerationCost = costs
      .filter((item) => item.job.executionMode !== "batch")
      .reduce((sum, item) => sum + item.cost.generationCost, 0);
    const batchGenerationCost = costs
      .filter((item) => item.job.executionMode === "batch")
      .reduce((sum, item) => sum + item.cost.generationCost, 0);
    const inputTokens = costs.reduce((sum, item) => sum + item.cost.inputTokens, 0);
    const outputTokens = costs.reduce((sum, item) => sum + item.cost.outputTokens, 0);
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
      pricedImageCount: costs.reduce((sum, item) => sum + item.cost.pricedImageCount, 0),
    };
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
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
    if (!args.productIds.length)
      throw new Error("Select at least one product.");
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

    const { imageProvider, executionMode, imageModel, vibeAnalysisDefault } =
      await currentGenerationEngine(ctx);
    const vibeAnalysis = args.useVibeAnalysis ?? vibeAnalysisDefault;
    const prompts = await ctx.db.query("promptTemplates").collect();
    const promptByType = new Map(
      prompts
        .filter((prompt) => prompt.isActive)
        .map((prompt) => [prompt.imageType, prompt]),
    );
    // Image types are defined by the prompt templates that exist; only keep
    // selections that map to an active template.
    const selectedImageTypes = Array.from(
      new Set(args.selectedImageTypes),
    ).filter((type) => promptByType.has(type));
    if (!selectedImageTypes.length)
      throw new Error(
        "None of the selected image types have an active prompt template.",
      );
    const now = Date.now();
    const planned: Array<{
      product: Doc<"products">;
      imageType: string;
      promptUsed: string;
      sourceImageUrl: string | null;
      sourceImageUrl2: string | null;
    }> = [];

    let anySkippedAsExisting = false;

    for (const product of products) {
      const existingImages = await ctx.db
        .query("generatedImages")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      const existingReady = new Set(
        existingImages
          .filter(
            (image) =>
              image.status === "generated" || image.status === "uploaded",
          )
          .map((image) => image.imageType),
      );

      for (const imageType of selectedImageTypes) {
        if (!args.forceRegenerate && existingReady.has(imageType)) {
          anySkippedAsExisting = true;
          continue;
        }
        const template = promptByType.get(imageType);
        if (!template)
          throw new Error(`No active prompt template found for ${imageType}.`);
        const promptUsed = appendRegenerationInstructions(
          renderPrompt(template.content, {
            PRODUCT_TITLE: product.title,
            PRODUCT_HANDLE: product.handle,
            IMAGE_TYPE: imageType,
          }),
          args.regenerationInstructions,
        );
        const references = referenceImageUrls(product);
        planned.push({
          product,
          imageType,
          promptUsed,
          sourceImageUrl: references[0] ?? null,
          sourceImageUrl2: references[1] ?? null,
        });
      }
    }

    if (!planned.length) {
      if (anySkippedAsExisting) {
        throw new Error(
          "All selected image types already exist for these products.",
        );
      }
      throw new Error(
        "No image tasks could be planned for the selected products.",
      );
    }

    const jobId = await ctx.db.insert("generationJobs", {
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
        productId: task.product._id,
        jobId,
        imageType: task.imageType,
        imageProvider,
        imageModel,
        promptUsed: task.promptUsed,
        sourceImageUrl: task.sourceImageUrl,
        sourceImageUrl2: task.sourceImageUrl2,
        generatedImageUrl: null,
        storageUrl: null,
        status: "queued",
        reviewStatus: "pending",
        shopifyMediaId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(task.product._id, {
        generationStatus: "generating",
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
  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  )
    return;
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_job", (q: any) => q.eq("jobId", args.jobId))
    .collect();
  const now = Date.now();
  for (const image of images) {
    if (image.status === "queued" || image.status === "generating") {
      await ctx.db.patch(image._id, {
        status: "canceled",
        error: args.reason,
        providerBatchId: image.providerBatchId ?? job.batchId,
        updatedAt: now,
      });
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

export const failImage = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    error: v.string(),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
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

export const reviewImages = mutation({
  args: {
    imageIds: v.array(v.id("generatedImages")),
    reviewStatus: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    let updated = 0;
    const affectedProductIds = new Set<Id<"products">>();
    const affectedJobIds = new Set<Id<"generationJobs">>();
    for (const imageId of Array.from(new Set(args.imageIds))) {
      const image = await ctx.db.get(imageId);
      if (
        !image ||
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
    await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");
    if (job.status !== "failed" && job.status !== "cancelled")
      throw new Error("Only failed or cancelled jobs can be retried.");

    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const toRetry = images.filter(
      (img) =>
        img.status === "failed" ||
        img.status === "canceled" ||
        img.status === "queued" ||
        img.status === "generating",
    );
    if (!toRetry.length) throw new Error("No failed images to retry.");

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
        if (img.status === "generating" || img.status === "queued") {
          await ctx.db.patch(img._id, {
            status: "failed",
            error: "Superseded by retry.",
            updatedAt: now,
          });
          affectedProductIds.add(img.productId);
          affectedJobIds.add(img.jobId);
        }
      }
    }

    for (const img of toRetry) {
      await ctx.db.patch(img._id, {
        status: "queued",
        reviewStatus: "pending",
        reviewedAt: undefined,
        reviewedByUserId: undefined,
        error: null,
        updatedAt: now,
      });
      await ctx.db.patch(img.productId, {
        generationStatus: "generating",
        updatedAt: now,
      });
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
      job.executionMode === "batch"
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
    const stuck = images.filter(
      (img) => img.status === "queued" || img.status === "generating",
    );
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
