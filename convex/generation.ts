"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { buildSeoImageFilename } from "./lib";
import { estimateCostUsd } from "./pricing";
import {
  generationInputUrlsForImage,
  referenceUrlsForImage,
  type BatchPollResult,
} from "./generation/batchTypes";
import {
  cleanupGeminiBatchFiles,
  ingestBatchResults,
} from "./generation/batchIngestion";
import {
  BATCH_SUBMISSION_STUCK_MS,
  batchPollDelayMs,
  isCancellableBatchStatus,
  type ManualPollResult,
  type PollBatchOptions,
  type TerminalBatchResult,
} from "./generation/batchPollingRules";
import { mimeToExtension } from "./generation/formats";
import { ProviderGenerationError } from "./generation/errors";
import { generateWithGemini } from "./generation/gemini";
import {
  cancelGeminiBatch,
  pollGeminiBatch,
  submitGeminiBatch,
} from "./generation/geminiBatchClient";
import { generateWithOpenAi } from "./generation/openAi";
import {
  cancelOpenAiBatch as cancelOpenAiBatchClient,
  pollOpenAiBatch as pollOpenAiBatchClient,
  submitOpenAiBatch,
} from "./generation/openAiBatch";
import { downloadBinary } from "./generation/download";
import { applyBackgroundPostProcessing } from "./generation/backgroundPostProcessing";
import { BackgroundRemovalError } from "./generation/backgroundRemoval";
import { optimizeForStorage } from "./generation/images";
import {
  intEnv,
  log,
  sleep,
  waitFromRateLimitMessage,
} from "./generation/runtime";
import { deleteFromR2, uploadToR2 } from "./generation/storage";
import type { GeneratedImage } from "./generation/types";
import {
  ensureProductVibe,
  finalPromptForImage,
  imageUsesVibe,
} from "./generation/vibe";

// ---------------------------------------------------------------------------
// Batch generation (asynchronous, ~50% cheaper than real-time)
// ---------------------------------------------------------------------------
export const deleteFromStorage = internalAction({
  args: { storageUrl: v.string() },
  handler: async (_ctx, args) => {
    await deleteFromR2(args.storageUrl);
  },
});

async function scheduleBatchPoll(
  ctx: Pick<ActionCtx, "scheduler">,
  jobId: Id<"generationJobs">,
  attempt = 0,
  delayMs = batchPollDelayMs(attempt),
) {
  await ctx.scheduler.runAfter(delayMs, internal.generation.pollBatchJob, {
    jobId,
    attempt,
  });
}

async function withResolvedModelReferenceUrl<
  T extends {
    modelReferenceStorageId?: Id<"_storage"> | null;
    modelReferenceUrl?: string | null;
  },
>(ctx: Pick<ActionCtx, "storage">, image: T): Promise<T> {
  if (image.modelReferenceUrl?.trim() || !image.modelReferenceStorageId) {
    return image;
  }
  const modelReferenceUrl = await ctx.storage.getUrl(
    image.modelReferenceStorageId,
  );
  return {
    ...image,
    modelReferenceUrl,
  };
}

export const submitBatch = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, {
      jobId: args.jobId,
    })) as Doc<"generationJobs"> | null;
    if (!job || job.status === "cancelled") return;
    const settings = (await ctx.runQuery(internal.settings.internalList, {
      shopId: job.shopId ?? null,
    })) as Record<string, unknown>;
    const allImages = (await ctx.runQuery(internal.jobs.imagesForJob, {
      jobId: args.jobId,
    })) as Doc<"generatedImages">[];
    const images = await Promise.all(
      allImages
        .filter((img) => img.status === "queued")
        .map((image) => withResolvedModelReferenceUrl(ctx, image)),
    );
    if (!images.length) {
      await ctx.runMutation(internal.jobs.finishJobIfDone, {
        jobId: args.jobId,
      });
      return;
    }
    const provider = images[0].imageProvider === "gemini" ? "gemini" : "openai";
    const model =
      images[0].imageModel ??
      (provider === "gemini" ? "gemini-3-pro-image" : "gpt-image-2");

    // Vibe analysis once per distinct product that has it enabled, then bake
    // scene context and multi-reference guidance into those prompts only.
    const vibeByProduct = new Map<string, string>();
    for (const image of images) {
      if (!imageUsesVibe(image, job, settings)) continue;
      const pid = image.productId as unknown as string;
      if (vibeByProduct.has(pid)) continue;
      const product = (await ctx.runQuery(internal.products.internalGet, {
        productId: image.productId,
      })) as Doc<"products"> | null;
      vibeByProduct.set(
        pid,
        product
          ? await ensureProductVibe(
              ctx,
              product,
              image.sourceImageUrl,
              settings,
              true,
            )
          : "",
      );
    }
    const preparedImages = images.map((image) => {
      const useVibeAnalysis = imageUsesVibe(image, job, settings);
      const vibe = useVibeAnalysis
        ? (vibeByProduct.get(image.productId as unknown as string) ?? "")
        : null;
      const finalPromptUsed = finalPromptForImage(image, vibe, useVibeAnalysis);
      return { ...image, finalPromptUsed, vibeUsed: vibe };
    });
    for (const image of preparedImages) {
      await ctx.runMutation(internal.jobs.markImagePromptPrepared, {
        imageId: image._id,
        finalPromptUsed: image.finalPromptUsed,
        vibeUsed: image.vibeUsed,
      });
    }

    log("batch", "submitting", {
      jobId: args.jobId,
      count: images.length,
      provider,
      model,
    });
    try {
      const submitted =
        provider === "gemini"
          ? await submitGeminiBatch({ images: preparedImages, settings, model })
          : {
              ...(await submitOpenAiBatch({
                images: preparedImages,
                settings,
                model,
              })),
              inputFileName: null,
            };
      await ctx.runMutation(internal.jobs.setBatchInfo, {
        jobId: args.jobId,
        batchId: submitted.batchId,
        batchStatus: submitted.batchStatus,
        batchInputFileName: submitted.inputFileName,
      });
      await ctx.runMutation(internal.jobs.markImagesGenerating, {
        jobId: args.jobId,
        providerBatchId: submitted.batchId,
      });
      log("batch", "submitted", {
        jobId: args.jobId,
        batchId: submitted.batchId,
        count: images.length,
      });
      await scheduleBatchPoll(ctx, args.jobId, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("batch", "submit failed", {
        jobId: args.jobId,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      try {
        for (const image of images) {
          await ctx.runMutation(internal.jobs.failImage, {
            imageId: image._id,
            error: message,
          });
        }
        await ctx.runMutation(internal.jobs.finishJobIfDone, {
          jobId: args.jobId,
        });
      } catch (cleanupError) {
        log("batch", "cleanup failed after submit error", {
          jobId: args.jobId,
          cleanupError:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
  },
});

async function processTerminalBatch(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  poll: Exclude<BatchPollResult, { state: "pending" }>,
): Promise<TerminalBatchResult> {
  if (poll.batchStatus !== undefined) {
    await ctx.runMutation(internal.jobs.setBatchStatus, {
      jobId: job._id,
      batchStatus: poll.batchStatus,
    });
  }
  const acquired = await ctx.runMutation(internal.jobs.acquireBatchIngestion, {
    jobId: job._id,
  });
  if (!acquired) return { state: "busy" as const };
  try {
    const images = (await ctx.runQuery(internal.jobs.imagesForJob, {
      jobId: job._id,
    })) as Doc<"generatedImages">[];
    const pending = images.filter(
      (image) => image.status === "queued" || image.status === "generating",
    );
    if (poll.state === "cancelled") {
      log("batch", "batch cancelled", {
        jobId: job._id,
        batchId: job.batchId,
        pending: pending.length,
      });
      await ctx.runMutation(internal.jobs.cancelInternal, {
        jobId: job._id,
        reason: "Provider batch was cancelled.",
        batchStatus: poll.batchStatus ?? job.batchStatus ?? null,
      });
      await cleanupGeminiBatchFiles(job);
      return { state: "cancelled" as const };
    }
    if (poll.state === "failed") {
      log("batch", "batch failed", {
        jobId: job._id,
        batchId: job.batchId,
        error: poll.error,
        pending: pending.length,
      });
      for (const image of pending) {
        await ctx.runMutation(internal.jobs.failImage, {
          imageId: image._id,
          error: poll.error,
        });
      }
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
      await cleanupGeminiBatchFiles(job);
      return { state: "failed" as const, error: poll.error };
    }

    if (!pending.length) {
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
      await cleanupGeminiBatchFiles(job);
      log("batch", "job done", { jobId: job._id, ingested: 0, failed: 0 });
      return { state: "done" as const, ingested: 0, failed: 0 };
    }

    log("batch", "ingesting", {
      jobId: job._id,
      batchId: job.batchId,
      source: poll.source.kind,
      pending: pending.length,
    });
    const { ingested, failed, complete } = await ingestBatchResults(
      ctx,
      job,
      pending,
      poll.source,
    );
    if (!complete) {
      log("batch", "chunk done", { jobId: job._id, ingested, failed });
      return { state: "partial" as const, ingested, failed };
    }
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
    await cleanupGeminiBatchFiles(job);
    log("batch", "job done", { jobId: job._id, ingested, failed });
    return { state: "done" as const, ingested, failed };
  } finally {
    await ctx.runMutation(internal.jobs.releaseBatchIngestion, {
      jobId: job._id,
    });
  }
}

async function pollOneBatch(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  options: PollBatchOptions = {},
): Promise<ManualPollResult | null> {
  if (!job.batchId) {
    if (Date.now() - job.updatedAt > BATCH_SUBMISSION_STUCK_MS) {
      log("batch", "stuck job detected, failing", {
        jobId: job._id,
        updatedAt: job.updatedAt,
      });
      await ctx.runMutation(internal.jobs.failStuckJob, {
        jobId: job._id,
        error:
          "Batch submission timed out — action was interrupted before batch ID assigned.",
      });
    }
    return null;
  }

  const attempt = Math.max(0, Math.floor(options.attempt ?? 0));
  const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
  const settings = (await ctx.runQuery(internal.settings.internalList, {
    shopId: job.shopId ?? null,
  })) as Record<string, unknown>;
  let poll: BatchPollResult;
  try {
    poll =
      provider === "gemini"
        ? await pollGeminiBatch(job.batchId, job.batchInputFileName)
        : await pollOpenAiBatchClient(job.batchId, settings);
  } catch (error) {
    log("batch", "poll error (will retry)", {
      jobId: job._id,
      batchId: job.batchId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (options.schedulePending) {
      const nextAttempt = attempt + 1;
      await scheduleBatchPoll(
        ctx,
        job._id,
        nextAttempt,
        batchPollDelayMs(nextAttempt),
      );
    }
    if (options.throwPollErrors) {
      throw new Error(
        `Poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  if (poll.batchStatus !== undefined) {
    await ctx.runMutation(internal.jobs.setBatchStatus, {
      jobId: job._id,
      batchStatus: poll.batchStatus,
    });
  }

  if (poll.state === "pending") {
    if (options.schedulePending) {
      const nextAttempt = attempt + 1;
      await scheduleBatchPoll(
        ctx,
        job._id,
        nextAttempt,
        batchPollDelayMs(nextAttempt),
      );
    }
    return { state: "pending", batchStatus: poll.batchStatus };
  }

  const result = await processTerminalBatch(ctx, job, poll);
  if (result.state === "partial" && options.schedulePartial) {
    await scheduleBatchPoll(ctx, job._id, 0, 1_000);
  }
  return result;
}

export const pollBatches = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = (await ctx.runQuery(
      internal.jobs.pendingBatchJobs,
      {},
    )) as Doc<"generationJobs">[];
    if (jobs.length) log("batch", "polling", { jobs: jobs.length });
    for (const job of jobs) {
      await pollOneBatch(ctx, job, { schedulePartial: true });
    }
  },
});

export const pollBatchJob = internalAction({
  args: {
    jobId: v.id("generationJobs"),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ManualPollResult | null> => {
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, {
      jobId: args.jobId,
    })) as Doc<"generationJobs"> | null;
    if (!job || job.status !== "running" || job.executionMode !== "batch")
      return null;
    return pollOneBatch(ctx, job, {
      attempt: args.attempt ?? 0,
      schedulePending: true,
      schedulePartial: true,
    });
  },
});

export const pollJob = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<ManualPollResult> => {
    await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, {
      jobId: args.jobId,
    })) as Doc<"generationJobs"> | null;
    if (!job) throw new Error("Job not found.");
    if (job.executionMode !== "batch")
      throw new Error("Job is not a batch job.");
    if (job.status !== "running") throw new Error("Job is not running.");
    if (!job.batchId) throw new Error("Job has no batch ID yet.");
    const result = await pollOneBatch(ctx, job, {
      schedulePending: true,
      schedulePartial: true,
      throwPollErrors: true,
    });
    if (!result) throw new Error("Poll did not return a batch state.");
    log("batch", "manual poll", {
      jobId: job._id,
      batchId: job.batchId,
      state: result.state,
      batchStatus: "batchStatus" in result ? result.batchStatus : undefined,
    });
    return result;
  },
});

export const cancelJob = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (
    ctx,
    args,
  ): Promise<{ state: "cancelled"; batchStatus?: string | null }> => {
    await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, {
      jobId: args.jobId,
    })) as Doc<"generationJobs"> | null;
    if (!job) throw new Error("Job not found.");
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      throw new Error(`Job is already ${job.status}.`);
    }

    let batchStatus = job.batchStatus ?? null;
    if (job.executionMode === "batch" && job.batchId) {
      const settings = (await ctx.runQuery(internal.settings.internalList, {
        shopId: job.shopId ?? null,
      })) as Record<string, unknown>;
      const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
      const poll =
        provider === "gemini"
          ? await pollGeminiBatch(job.batchId, job.batchInputFileName)
          : await pollOpenAiBatchClient(job.batchId, settings);
      if (poll.batchStatus !== undefined) {
        batchStatus = poll.batchStatus ?? null;
        await ctx.runMutation(internal.jobs.setBatchStatus, {
          jobId: job._id,
          batchStatus,
        });
      }
      if (poll.state === "cancelled") {
        await processTerminalBatch(ctx, job, poll);
        return { state: "cancelled", batchStatus };
      }
      if (poll.state === "done" || poll.state === "failed") {
        await processTerminalBatch(ctx, job, poll);
        throw new Error(`Batch is already ${poll.state}.`);
      }
      if (!isCancellableBatchStatus(provider, batchStatus)) {
        throw new Error(
          `Batch cannot be cancelled in provider status ${batchStatus}.`,
        );
      }
      batchStatus =
        provider === "gemini"
          ? await cancelGeminiBatch(job.batchId)
          : await cancelOpenAiBatchClient(job.batchId);
      await ctx.runMutation(internal.jobs.setBatchStatus, {
        jobId: job._id,
        batchStatus,
      });
    }

    await ctx.runMutation(internal.jobs.cancelInternal, {
      jobId: args.jobId,
      reason: "Job cancelled by user.",
      batchStatus,
    });
    log("batch", "job cancelled", {
      jobId: args.jobId,
      batchId: job.batchId,
      batchStatus,
    });
    return { state: "cancelled", batchStatus };
  },
});

export const processJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, {
      jobId: args.jobId,
    })) as Doc<"generationJobs"> | null;
    if (!job || job.status === "cancelled") return;
    const settings = (await ctx.runQuery(internal.settings.internalList, {
      shopId: job.shopId ?? null,
    })) as Record<string, unknown>;
    const maxRetries = intEnv("MAX_RETRIES", 2);
    log("realtime", "job start", {
      jobId: args.jobId,
      provider: job?.imageProvider,
      model: job?.imageModel,
      tasks: job?.totalTasks,
    });

    let done = 0;
    let failed = 0;
    while (true) {
      const queuedImage = (await ctx.runQuery(internal.jobs.nextQueuedImage, {
        jobId: args.jobId,
      })) as Doc<"generatedImages"> | null;
      if (!queuedImage) break;
      const image = await withResolvedModelReferenceUrl(ctx, queuedImage);

      const imageProvider =
        image.imageProvider === "gemini" ? "gemini" : "openai";
      const rpm =
        imageProvider === "gemini"
          ? Math.max(
              1,
              Number(
                settings.GEMINI_IMAGE_REQUESTS_PER_MINUTE ??
                  intEnv("GEMINI_IMAGE_REQUESTS_PER_MINUTE", 5),
              ),
            )
          : Math.max(
              1,
              Number(
                settings.OPENAI_IMAGE_REQUESTS_PER_MINUTE ??
                  intEnv("OPENAI_IMAGE_REQUESTS_PER_MINUTE", 5),
              ),
            );
      const minimumIntervalMs = Math.ceil(60_000 / rpm);
      await ctx.runMutation(internal.jobs.markImageGenerating, {
        imageId: image._id,
      });
      try {
        const product = (await ctx.runQuery(internal.products.internalGet, {
          productId: image.productId,
        })) as Doc<"products"> | null;
        if (!product) throw new Error("Product not found.");
        const safeHandle = product.handle
          .replace(/[^a-z0-9-]+/gi, "-")
          .toLowerCase();
        let result: GeneratedImage | null = null;
        let costUsd = image.costUsd ?? 0;
        let costRateMultiplier = image.costRateMultiplier ?? 1;

        if (image.backgroundRemovalInputUrl) {
          log("realtime", "resuming background removal", {
            handle: product.handle,
            type: image.imageType,
          });
          const staged = await downloadBinary(image.backgroundRemovalInputUrl);
          const contentType =
            image.backgroundRemovalInputContentType ??
            staged.contentType ??
            "image/png";
          result = {
            bytes: staged.bytes,
            contentType,
            extension:
              image.backgroundRemovalInputExtension ??
              mimeToExtension(contentType),
            usage: {
              inputTokens: image.inputTokens ?? 0,
              outputTokens: image.outputTokens ?? 0,
            },
            providerBatchId: image.providerBatchId,
            providerRequestId: image.providerRequestId,
            providerResponseId: image.providerResponseId,
          };
        } else {
          const sourceImageUrls = referenceUrlsForImage(image);
          const generationInputUrls = generationInputUrlsForImage(image);
          if (!sourceImageUrls.length)
            throw new Error(
              "Product has no Shopify supplier image to use as reference.",
            );
          log("realtime", "generating", {
            handle: product.handle,
            type: image.imageType,
            provider: imageProvider,
            model: image.imageModel,
          });
          const useVibeAnalysis = imageUsesVibe(image, job, settings);
          const vibe = useVibeAnalysis
            ? await ensureProductVibe(
                ctx,
                product,
                sourceImageUrls[0],
                settings,
                true,
              )
            : null;
          const prompt = finalPromptForImage(image, vibe, useVibeAnalysis);
          await ctx.runMutation(internal.jobs.markImagePromptPrepared, {
            imageId: image._id,
            finalPromptUsed: prompt,
            vibeUsed: vibe,
          });
          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
              result =
                imageProvider === "gemini"
                  ? await generateWithGemini({
                      prompt,
                      sourceImageUrl: generationInputUrls[0],
                      sourceImageUrl2: generationInputUrls[1] ?? null,
                      sourceImageUrls: generationInputUrls,
                      model: image.imageModel,
                      settings,
                    })
                  : await generateWithOpenAi({
                      prompt,
                      sourceImageUrl: generationInputUrls[0],
                      sourceImageUrl2: generationInputUrls[1] ?? null,
                      sourceImageUrls: generationInputUrls,
                      model: image.imageModel,
                      settings,
                    });
              break;
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              const canRetry =
                /rate limit|try again|429/i.test(message) &&
                attempt < maxRetries;
              if (!canRetry) throw error;
              await sleep(waitFromRateLimitMessage(message, minimumIntervalMs));
            }
          }
          if (!result) throw new Error("Image generation failed.");
          costUsd = estimateCostUsd(image.imageModel ?? "", result.usage);
          costRateMultiplier = 1;
        }
        if (!result) throw new Error("Image generation failed.");
        const processed = await applyBackgroundPostProcessing({
          ctx,
          image,
          generated: result,
          safeHandle,
          providerCostUsd: costUsd,
          costRateMultiplier,
        });
        const optimized = await optimizeForStorage(
          processed.bytes,
          processed.contentType,
          processed.extension,
        );
        const filename = buildSeoImageFilename({
          title: product.title,
          imageType: image.imageType,
          extension: optimized.extension,
        });
        const key = `generated/${safeHandle}/${Date.now().toString(36)}/${filename}`;
        const storageUrl = await uploadToR2({
          bytes: optimized.bytes,
          key,
          contentType: optimized.contentType,
        });
        await ctx.runMutation(internal.jobs.completeImage, {
          imageId: image._id,
          generatedImageUrl: storageUrl,
          storageUrl,
          providerRequestId: result.providerRequestId,
          providerResponseId: result.providerResponseId,
          transparentCutoutUrl: processed.transparentCutoutUrl,
          backgroundRemovalProvider: processed.backgroundRemovalProvider,
          backgroundRemovalCostUsd: processed.backgroundRemovalCostUsd,
          backgroundRemovalRequestId: processed.backgroundRemovalRequestId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd,
          costRateMultiplier,
        });
        done += 1;
        log("realtime", "stored", {
          handle: product.handle,
          type: image.imageType,
          file: filename,
          kb: Math.round(optimized.bytes.length / 1024),
          costUsd,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed += 1;
        log("realtime", "failed", { type: image.imageType, error: message });
        const providerIds =
          error instanceof ProviderGenerationError ? error.providerIds : {};
        await ctx.runMutation(internal.jobs.failImage, {
          imageId: image._id,
          error: message,
          providerRequestId: providerIds.providerRequestId,
          providerResponseId: providerIds.providerResponseId,
          backgroundRemovalRequestId:
            error instanceof BackgroundRemovalError
              ? error.requestId
              : undefined,
        });
      }
      await sleep(minimumIntervalMs);
    }

    log("realtime", "job done", { jobId: args.jobId, done, failed });
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
  },
});
