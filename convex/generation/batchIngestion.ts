"use node";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { buildSeoImageFilename } from "../lib";
import { BATCH_PRICE_MULTIPLIER, estimateCostUsd } from "../pricing";
import { BackgroundRemovalError } from "./backgroundRemoval";
import { applyBackgroundPostProcessing } from "./backgroundPostProcessing";
import {
  type BatchIngestCounts,
  type BatchIngestResult,
  type BatchItem,
  type BatchResultSource,
} from "./batchTypes";
import { mapConcurrent } from "./concurrency";
import { geminiBatchItem } from "./geminiBatch";
import { deleteGeminiFile } from "./geminiBatchClient";
import {
  consumeFirstInlineResponseArray,
  consumeJsonLines,
  geminiIngestChunkSize,
} from "./geminiStream";
import { mimeToExtension } from "./formats";
import { optimizeForStorage } from "./images";
import { env, log } from "./runtime";
import { uploadToR2 } from "./storage";
import type { GeneratedImage } from "./types";

export async function ingestBatchItem(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
  result: BatchItem | undefined,
): Promise<BatchIngestCounts> {
  if (!result || result.error || !result.bytes) {
    const error = result?.error ?? "No batch result returned for this image.";
    log("batch", "image failed", {
      jobId: job._id,
      type: image.imageType,
      error,
    });
    const changed: boolean = await ctx.runMutation(internal.jobs.failImage, {
      imageId: image._id,
      error,
      providerBatchId: job.batchId,
      providerRequestId: result?.providerRequestId,
      providerResponseId: result?.providerResponseId,
    });
    return { ingested: 0, failed: changed ? 1 : 0 };
  }
  try {
    const product = (await ctx.runQuery(internal.products.internalGet, {
      productId: image.productId,
    })) as Doc<"products"> | null;
    const safeHandle = (product?.handle ?? "product")
      .replace(/[^a-z0-9-]+/gi, "-")
      .toLowerCase();
    const generated: GeneratedImage = {
      bytes: result.bytes,
      contentType: result.contentType ?? "image/png",
      extension: mimeToExtension(result.contentType ?? "image/png"),
      usage: result.usage ?? {},
      providerBatchId: result.providerBatchId,
      providerRequestId: result.providerRequestId,
      providerResponseId: result.providerResponseId,
    };
    const usage = result.usage ?? {};
    const costUsd = estimateCostUsd(job.imageModel ?? "", usage, {
      batch: job.executionMode === "batch",
    });
    const costRateMultiplier =
      job.executionMode === "batch" ? BATCH_PRICE_MULTIPLIER : 1;
    const processed = await applyBackgroundPostProcessing({
      ctx,
      image,
      generated,
      safeHandle,
      providerCostUsd: costUsd,
      costRateMultiplier,
      providerBatchId: job.batchId,
    });
    const optimized = await optimizeForStorage(
      processed.bytes,
      processed.contentType,
      processed.extension,
    );
    const filename = buildSeoImageFilename({
      title: product?.title ?? safeHandle,
      imageType: image.imageType,
      extension: optimized.extension,
    });
    const key = `generated/${safeHandle}/${Date.now().toString(36)}/${filename}`;
    const storageUrl = await uploadToR2({
      bytes: optimized.bytes,
      key,
      contentType: optimized.contentType,
    });
    const changed: boolean = await ctx.runMutation(
      internal.jobs.completeImage,
      {
        imageId: image._id,
        generatedImageUrl: storageUrl,
        storageUrl,
        providerBatchId: job.batchId,
        providerRequestId: result.providerRequestId,
        providerResponseId: result.providerResponseId,
        transparentCutoutUrl: processed.transparentCutoutUrl,
        backgroundRemovalProvider: processed.backgroundRemovalProvider,
        backgroundRemovalCostUsd: processed.backgroundRemovalCostUsd,
        backgroundRemovalRequestId: processed.backgroundRemovalRequestId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd,
        costRateMultiplier,
      },
    );
    log("batch", "stored", {
      jobId: job._id,
      handle: safeHandle,
      type: image.imageType,
      file: filename,
      kb: Math.round(optimized.bytes.length / 1024),
      costUsd,
    });
    return { ingested: changed ? 1 : 0, failed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("batch", "image failed", {
      jobId: job._id,
      type: image.imageType,
      error: message,
    });
    const changed: boolean = await ctx.runMutation(internal.jobs.failImage, {
      imageId: image._id,
      error: message,
      providerBatchId: job.batchId,
      providerRequestId: result.providerRequestId,
      providerResponseId: result.providerResponseId,
      backgroundRemovalRequestId:
        error instanceof BackgroundRemovalError ? error.requestId : undefined,
    });
    return { ingested: 0, failed: changed ? 1 : 0 };
  }
}

export async function ingestGeminiStream(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  pending: Doc<"generatedImages">[],
  chunkSize: number,
  consume: (onItem: (item: unknown) => Promise<boolean>) => Promise<boolean>,
): Promise<BatchIngestResult> {
  const byId = new Map(pending.map((image) => [image._id as string, image]));
  const seen = new Set<string>();
  let ingested = 0;
  let failed = 0;
  let index = 0;
  let processed = 0;
  const complete = await consume(async (raw: any) => {
    const key: string | undefined = raw?.metadata?.key ?? raw?.key;
    const image = key ? byId.get(key) : pending[index];
    index += 1;
    if (!image || seen.has(image._id)) return true;
    seen.add(image._id);
    const { result } = geminiBatchItem(raw);
    const count = await ingestBatchItem(ctx, job, image, result);
    ingested += count.ingested;
    failed += count.failed;
    processed += 1;
    return processed < chunkSize;
  });
  if (complete) {
    for (const image of pending) {
      if (seen.has(image._id)) continue;
      const count = await ingestBatchItem(ctx, job, image, undefined);
      failed += count.failed;
    }
  }
  return { ingested, failed, complete };
}

export async function ingestBatchResults(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  pending: Doc<"generatedImages">[],
  source: BatchResultSource,
): Promise<BatchIngestResult> {
  if (source.kind === "items") {
    const counts = await mapConcurrent(pending, 5, (image) =>
      ingestBatchItem(ctx, job, image, source.results.get(image._id)),
    );
    const total = counts.reduce(
      (acc, count) => ({
        ingested: acc.ingested + count.ingested,
        failed: acc.failed + count.failed,
      }),
      { ingested: 0, failed: 0 },
    );
    return { ...total, complete: true };
  }
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  if (source.kind === "gemini-file") {
    const requestedOffset = job.batchResultOffset ?? 0;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/download/v1beta/${source.fileName}:download?alt=media`,
      {
        headers: {
          "x-goog-api-key": apiKey,
          ...(requestedOffset ? { Range: `bytes=${requestedOffset}-` } : {}),
        },
      },
    );
    if (!response.ok)
      throw new Error(
        `Gemini result file download failed (${response.status}).`,
      );
    const startOffset =
      requestedOffset && response.status === 206 ? requestedOffset : 0;
    if (startOffset !== requestedOffset) {
      log(
        "batch",
        "Gemini result file ignored range request, restarting cursor",
        { jobId: job._id, requestedOffset },
      );
      await ctx.runMutation(internal.jobs.setBatchResultOffset, {
        jobId: job._id,
        offset: 0,
      });
    }
    const chunkSize = geminiIngestChunkSize(pending);
    return ingestGeminiStream(ctx, job, pending, chunkSize, (onItem) =>
      consumeJsonLines(
        response,
        startOffset,
        async (line) => onItem(JSON.parse(line)),
        async (offset) => {
          await ctx.runMutation(internal.jobs.setBatchResultOffset, {
            jobId: job._id,
            offset,
          });
        },
      ),
    );
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${source.batchName}`,
    {
      headers: { "x-goog-api-key": apiKey },
    },
  );
  if (!response.ok)
    throw new Error(
      `Gemini legacy inline batch download failed (${response.status}).`,
    );
  return ingestGeminiStream(
    ctx,
    job,
    pending,
    geminiIngestChunkSize(pending),
    (onItem) => consumeFirstInlineResponseArray(response, onItem),
  );
}

export async function cleanupGeminiBatchFiles(job: Doc<"generationJobs">) {
  if (job.imageProvider !== "gemini") return;
  try {
    await deleteGeminiFile(job.batchInputFileName);
  } catch (error) {
    log("batch", "Gemini input file cleanup failed", {
      jobId: job._id,
      fileName: job.batchInputFileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
