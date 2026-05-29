import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { availableTypesForProduct, isImageType, renderPrompt } from "./lib";

type ImageProvider = "openai" | "gemini";
type ExecutionMode = "realtime" | "batch";

// Reference images for a product, in priority order, de-duplicated.
// First entry feeds the primary reference, the second (if any) is passed as a
// staging/context reference alongside the prompt.
function referenceImageUrls(product: Doc<"products">): string[] {
  const candidates = [
    product.featuredImageUrl,
    ...product.currentShopifyImages.map((image) => (image as { url?: string } | null)?.url)
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  return Array.from(new Set(candidates));
}

async function currentGenerationEngine(ctx: MutationCtx) {
  const rows = await ctx.db.query("appSettings").collect();
  const settings = Object.fromEntries(rows.map((row: Doc<"appSettings">) => [row.key, row.value]));
  const imageProvider: ImageProvider = settings.IMAGE_PROVIDER === "gemini" ? "gemini" : "openai";
  const executionMode: ExecutionMode = settings.GENERATION_EXECUTION_MODE === "batch" ? "batch" : "realtime";
  const imageModel =
    imageProvider === "gemini"
      ? String(settings.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview")
      : String(settings.OPENAI_IMAGE_MODEL ?? "gpt-image-2-2026-04-21");
  const vibeAnalysisDefault = String(settings.VIBE_ANALYSIS ?? "on") !== "off";
  return { imageProvider, executionMode, imageModel, vibeAnalysisDefault };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.db.query("generationJobs").withIndex("by_created").order("desc").take(100);
  }
});

export const costSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const images = await ctx.db.query("generatedImages").collect();
    const products = await ctx.db.query("products").collect();
    const generationCost = images.reduce((sum, image) => sum + (image.costUsd ?? 0), 0);
    const inputTokens = images.reduce((sum, image) => sum + (image.inputTokens ?? 0), 0);
    const outputTokens = images.reduce((sum, image) => sum + (image.outputTokens ?? 0), 0);
    const analysisCost = products.reduce((sum, product) => sum + (product.vibeCostUsd ?? 0), 0);
    return {
      generationCost,
      analysisCost,
      totalCost: generationCost + analysisCost,
      inputTokens,
      outputTokens,
      pricedImageCount: images.filter((image) => image.costUsd != null).length
    };
  }
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const images = await ctx.db.query("generatedImages").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).collect();
    const products = await Promise.all(job.productIds.map((id) => ctx.db.get(id)));
    return { job, images, products: products.filter(Boolean) };
  }
});

export const create = mutation({
  args: {
    productIds: v.array(v.id("products")),
    selectedImageTypes: v.array(v.string()),
    forceRegenerate: v.boolean(),
    useVibeAnalysis: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const selectedImageTypes = Array.from(new Set(args.selectedImageTypes.filter(isImageType)));
    if (!args.productIds.length) throw new Error("Select at least one product.");
    if (!selectedImageTypes.length) throw new Error("Select at least one image type.");

    const products = (await Promise.all(args.productIds.map((id) => ctx.db.get(id)))).filter(Boolean) as Doc<"products">[];
    if (!products.length) throw new Error("No products found.");

    const { imageProvider, executionMode, imageModel, vibeAnalysisDefault } = await currentGenerationEngine(ctx);
    const vibeAnalysis = args.useVibeAnalysis ?? vibeAnalysisDefault;
    const prompts = await ctx.db.query("promptTemplates").collect();
    const promptByType = new Map(prompts.filter((prompt) => prompt.isActive).map((prompt) => [prompt.imageType, prompt]));
    const now = Date.now();
    const planned: Array<{
      product: Doc<"products">;
      imageType: string;
      promptUsed: string;
      sourceImageUrl: string | null;
      sourceImageUrl2: string | null;
    }> = [];

    let anyTypeAvailable = false;
    let anySkippedAsExisting = false;

    for (const product of products) {
      const available = new Set(availableTypesForProduct(product.detectedFixations));
      const existingImages = await ctx.db
        .query("generatedImages")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      const existingReady = new Set(
        existingImages
          .filter((image) => image.status === "generated" || image.status === "uploaded")
          .map((image) => image.imageType)
      );

      for (const imageType of selectedImageTypes) {
        if (!available.has(imageType as never)) continue;
        anyTypeAvailable = true;
        if (!args.forceRegenerate && existingReady.has(imageType)) {
          anySkippedAsExisting = true;
          continue;
        }
        const template = promptByType.get(imageType);
        if (!template) throw new Error(`No active prompt template found for ${imageType}.`);
        const promptUsed = renderPrompt(template.content, {
          PRODUCT_TITLE: product.title,
          PRODUCT_HANDLE: product.handle,
          IMAGE_TYPE: imageType,
          FIXATION_TYPE: imageType
        });
        const references = referenceImageUrls(product);
        planned.push({
          product,
          imageType,
          promptUsed,
          sourceImageUrl: references[0] ?? null,
          sourceImageUrl2: references[1] ?? null
        });
      }
    }

    if (!planned.length) {
      if (anyTypeAvailable && anySkippedAsExisting) {
        throw new Error(
          "All selected image types already exist for these products. Enable \"Regenerate existing\" to recreate them."
        );
      }
      throw new Error(
        "None of the selected image types apply to the chosen products. Fixation types only run on products where that fixation was detected."
      );
    }

    const jobId = await ctx.db.insert("generationJobs", {
      status: "queued",
      mode: products.length === 1 ? "single" : "bulk",
      executionMode,
      batchId: null,
      vibeAnalysis,
      imageProvider,
      imageModel,
      productIds: products.map((product) => product._id),
      selectedImageTypes,
      forceRegenerate: args.forceRegenerate,
      totalTasks: planned.length,
      completedTasks: 0,
      failedTasks: 0,
      error: null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now
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
        shopifyMediaId: null,
        error: null,
        createdAt: now,
        updatedAt: now
      });
      await ctx.db.patch(task.product._id, { generationStatus: "generating", updatedAt: now });
    }

    await ctx.scheduler.runAfter(
      0,
      executionMode === "batch" ? internal.generation.submitBatch : internal.generation.processJob,
      { jobId }
    );
    return jobId;
  }
});

export const cancel = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");
    if (job.status === "completed" || job.status === "failed") return;
    await ctx.db.patch(args.jobId, { status: "cancelled", updatedAt: Date.now(), completedAt: Date.now() });
  }
});

export const markRunning = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "running",
      startedAt: Date.now(),
      updatedAt: Date.now()
    });
  }
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
  }
});

export const getJobInternal = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  }
});

export const imagesForJob = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  }
});

export const setBatchId = internalMutation({
  args: { jobId: v.id("generationJobs"), batchId: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { batchId: args.batchId, updatedAt: Date.now() });
  }
});

export const markImagesGenerating = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "queued"))
      .collect();
    const now = Date.now();
    for (const image of images) {
      await ctx.db.patch(image._id, { status: "generating", updatedAt: now });
    }
  }
});

export const pendingBatchJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    return running.filter((job) => job.executionMode === "batch" && Boolean(job.batchId));
  }
});

export const completeImage = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    generatedImageUrl: v.string(),
    storageUrl: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) return;
    await ctx.db.patch(args.imageId, {
      generatedImageUrl: args.generatedImageUrl,
      storageUrl: args.storageUrl,
      status: "generated",
      error: null,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      updatedAt: Date.now()
    });
    await ctx.db.patch(image.jobId, {
      completedTasks: (await ctx.db.get(image.jobId))!.completedTasks + 1,
      updatedAt: Date.now()
    });
  }
});

export const failImage = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    error: v.string()
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) return;
    const job = await ctx.db.get(image.jobId);
    await ctx.db.patch(args.imageId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now()
    });
    if (job) {
      await ctx.db.patch(job._id, {
        failedTasks: job.failedTasks + 1,
        updatedAt: Date.now()
      });
    }
  }
});

export const markImageGenerating = internalMutation({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, { status: "generating", updatedAt: Date.now() });
  }
});

export const finishJobIfDone = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;
    const done = job.completedTasks + job.failedTasks >= job.totalTasks;
    if (!done) return false;
    const status = job.failedTasks > 0 ? "failed" : "completed";
    await ctx.db.patch(args.jobId, {
      status,
      error: job.failedTasks > 0 ? `${job.failedTasks} image task(s) failed.` : null,
      completedAt: Date.now(),
      updatedAt: Date.now()
    });

    for (const productId of job.productIds as Id<"products">[]) {
      const images = await ctx.db.query("generatedImages").withIndex("by_product", (q) => q.eq("productId", productId)).collect();
      const relevant = images.filter((image) => image.jobId === args.jobId);
      const anyFailed = relevant.some((image) => image.status === "failed");
      const anyGenerated = relevant.some((image) => image.status === "generated" || image.status === "uploaded");
      await ctx.db.patch(productId, {
        generationStatus: anyFailed && anyGenerated ? "partial" : anyFailed ? "failed" : "ready",
        updatedAt: Date.now()
      });
    }
    return true;
  }
});
