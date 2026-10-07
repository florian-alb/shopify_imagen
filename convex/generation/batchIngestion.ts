"use node";

import { internal } from "../_generated/api";
import { createHash } from "node:crypto";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { BATCH_PRICE_MULTIPLIER, estimateCostUsd } from "../pricing";
import {
  type BatchIngestCounts,
  type BatchIngestResult,
  type BatchItem,
  type BatchResultSource,
} from "./batchTypes";
import { mapConcurrent } from "./concurrency";
import { geminiBatchItem } from "./geminiBatch";
import { deleteGeminiFile } from "./geminiBatchClient";
import { cleanupOpenAiBatchReferencesForImage } from "./openAiBatch";
import { ingestOpenAiBatchFilePage } from "./openAiDurableClient";
import {
  consumeFirstInlineResponseArray,
  consumeJsonLines,
  geminiIngestChunkSize,
} from "./geminiStream";
import { mimeToExtension } from "./formats";
import { env, log } from "./runtime";
import { uploadToR2 } from "./storage";
import { withRequestTimeout } from "./requestTimeout";

type BatchIngestOptions = {
  resultOffset?: number;
  resultFileIndex?: number;
  chunkSize?: number;
  onResultOffset?: (offset: number) => Promise<void>;
  onResultFileIndex?: (fileIndex: number) => Promise<void>;
};

async function cleanupOpenAiBatchReferencesIfTerminal(
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
) {
  if (job.executionMode !== "batch" || job.imageProvider !== "openai") return;
  await cleanupOpenAiBatchReferencesForImage(image);
}

export async function ingestBatchItem(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
  result: BatchItem | undefined,
): Promise<BatchIngestCounts> {
  const current: Doc<"generatedImages"> | null = await ctx.runQuery(
    internal.openAiDurable.imageForIngestion, { imageId: image._id },
  );
  if (!current || (current.status !== "queued" && current.status !== "generating") ||
    (current.batchSegmentId ?? null) !== (image.batchSegmentId ?? null) ||
    (current.providerBatchId && current.providerBatchId !== job.batchId)) {
    return { ingested: 0, failed: 0 };
  }
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
      expectedSegmentId: image.batchSegmentId ?? null,
      providerRequestId: result?.providerRequestId,
      providerResponseId: result?.providerResponseId,
    });
    await cleanupOpenAiBatchReferencesIfTerminal(job, image);
    return { ingested: 0, failed: changed ? 1 : 0 };
  }

  try {
    const contentType = result.contentType ?? "image/png";
    const extension = mimeToExtension(contentType);
    const token = createHash("sha256").update(job.batchId ?? job._id).digest("hex").slice(0, 24);
    const key = `generated/batch-staging/${job._id}/${image._id}/${token}.${extension}`;
    const inputUrl = await withRequestTimeout("Batch result staging", 120_000, (signal) =>
      uploadToR2({ bytes: result.bytes!, key, contentType, signal }),
    );
    const usage = result.usage ?? {};
    const costUsd = estimateCostUsd(job.imageModel ?? "", usage, {
      batch: job.executionMode === "batch",
    });
    const costRateMultiplier =
      job.executionMode === "batch" ? BATCH_PRICE_MULTIPLIER : 1;
    const changed: boolean = await ctx.runMutation(
      internal.jobs.markImagePostprocessing,
      {
        imageId: image._id,
        inputUrl,
        inputContentType: contentType,
        inputExtension: extension,
        providerBatchId: job.batchId,
        expectedSegmentId: image.batchSegmentId ?? null,
        providerRequestId: result.providerRequestId,
        providerResponseId: result.providerResponseId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd,
        costRateMultiplier,
      },
    );
    await cleanupOpenAiBatchReferencesIfTerminal(job, image);
    log("batch", "staged", {
      jobId: job._id,
      type: image.imageType,
      kb: Math.round(result.bytes.length / 1024),
      costUsd,
    });
    return { ingested: changed ? 1 : 0, failed: 0 };
  } catch (error) {
    // A transient staging failure must leave the provider result and cursor
    // available for the next durable step, without paying to regenerate it.
    if (job.imageProvider === "openai" && job.openAiDurable) throw error;
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
      expectedSegmentId: image.batchSegmentId ?? null,
      providerRequestId: result.providerRequestId,
      providerResponseId: result.providerResponseId,
    });
    await cleanupOpenAiBatchReferencesIfTerminal(job, image);
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
  options: BatchIngestOptions = {},
): Promise<BatchIngestResult> {
  if (source.kind === "items") {
    const counts = await mapConcurrent(pending, 3, async (image) =>
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

  if (source.kind === "openai-file") {
    const files = [source.outputFileId, source.errorFileId];
    let fileIndex = options.resultFileIndex ?? job.batchResultFileIndex ?? 0;
    let resultOffset = options.resultOffset ?? job.batchResultOffset ?? 0;
    let ingested = 0;
    let failed = 0;
    const seen = new Set<string>();
    const byId = new Map(pending.map((image) => [image._id as string, image]));
    const onResultOffset = options.onResultOffset ?? (async (offset: number) => {
      await ctx.runMutation(internal.jobs.setBatchResultOffset, { jobId: job._id, offset, fileIndex });
    });
    const onResultFileIndex = options.onResultFileIndex ?? (async (index: number) => {
      await ctx.runMutation(internal.jobs.setBatchResultOffset, { jobId: job._id, offset: 0, fileIndex: index });
    });
    while (fileIndex < files.length) {
      const fileId = files[fileIndex];
      if (fileId) {
        const page = await ingestOpenAiBatchFilePage({
          fileId, byteOffset: resultOffset,
          settings: { OPENAI_IMAGE_OUTPUT_FORMAT: source.outputFormat ?? "jpeg" },
          maxItems: options.chunkSize ?? 2,
          onItem: async (imageId, item, nextByteOffset) => {
            const image = byId.get(imageId);
            if (image && !seen.has(imageId)) {
              const count = await ingestBatchItem(ctx, job, image, item);
              ingested += count.ingested;
              failed += count.failed;
              seen.add(imageId);
            }
            await onResultOffset(nextByteOffset);
          },
        });
        resultOffset = page.byteOffset;
        await onResultOffset(resultOffset);
        if (!page.done) return { ingested, failed, complete: false };
      }
      // Reset the cursor first: a crash before changing the file index can
      // replay a completed output file, but can never skip its error file.
      await onResultOffset(0);
      fileIndex++;
      resultOffset = 0;
      await onResultFileIndex(fileIndex);
    }
    for (const image of pending) {
      if (seen.has(image._id)) continue;
      const count = await ingestBatchItem(ctx, job, image, undefined);
      failed += count.failed;
    }
    return { ingested, failed, complete: true };
  }

  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");

  if (source.kind === "gemini-file") {
    const requestedOffset = options.resultOffset ?? job.batchResultOffset ?? 0;
    const onResultOffset =
      options.onResultOffset ??
      (async (offset: number) => {
        await ctx.runMutation(internal.jobs.setBatchResultOffset, {
          jobId: job._id,
          offset,
        });
      });
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
      log("batch", "Gemini result file ignored range request, restarting cursor", {
        jobId: job._id,
        requestedOffset,
      });
      await onResultOffset(0);
    }
    const chunkSize = options.chunkSize ?? geminiIngestChunkSize(pending);
    return ingestGeminiStream(ctx, job, pending, chunkSize, (onItem) =>
      consumeJsonLines(
        response,
        startOffset,
        async (line) => onItem(JSON.parse(line)),
        onResultOffset,
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
    options.chunkSize ?? geminiIngestChunkSize(pending),
    (onItem) => consumeFirstInlineResponseArray(response, onItem),
  );
}

export async function cleanupGeminiInputFile(
  jobId: string,
  fileName: string | null | undefined,
) {
  try {
    await deleteGeminiFile(fileName);
  } catch (error) {
    log("batch", "Gemini input file cleanup failed", {
      jobId,
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function cleanupGeminiBatchFiles(job: Doc<"generationJobs">) {
  if (job.imageProvider !== "gemini") return;
  await cleanupGeminiInputFile(job._id, job.batchInputFileName);
}
