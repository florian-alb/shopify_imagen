"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { generationInputUrlsForImage } from "./generation/batchTypes";
import {
  ensureProductVibe,
  finalPromptForImage,
  imageUsesVibe,
} from "./generation/vibe";
import { intEnv } from "./generation/runtime";
import {
  prepareOpenAiBatchReferences,
  uploadOpenAiBatchInput,
  createOpenAiBatchFromFile,
  findOpenAiBatchBySubmissionKey,
  getOpenAiBatchState,
  ingestOpenAiBatchFilePage,
  OpenAiBatchRejectedError,
} from "./generation/openAiDurableClient";
import { ingestBatchItem } from "./generation/batchIngestion";
import { cancelOpenAiBatch } from "./generation/openAiBatch";

// Explicit operator command, never called by the watchdog or workflow. It
// preserves the original submission identity and refuses partial/ambiguous scans.
export const recoverUncertainSubmission = internalAction({
  args: {
    segmentId: v.id("generationBatchSegments"),
    expectedSubmissionKey: v.string(),
    expectedInputFileId: v.string(),
    expectedAttemptedAt: v.number(),
    confirmResubmission: v.literal(true),
  },
  returns: v.object({
    retiredSegmentId: v.id("generationBatchSegments"),
    replacementSegmentId: v.id("generationBatchSegments"),
  }),
  handler: async (ctx, args): Promise<{
    retiredSegmentId: Doc<"generationBatchSegments">["_id"];
    replacementSegmentId: Doc<"generationBatchSegments">["_id"];
  }> => {
    const data = await ctx.runQuery(internal.openAiDurable.context, {
      segmentId: args.segmentId,
    });
    const s = data?.segment;
    if (!s || data?.job.status !== "running" || s.provider !== "openai" ||
      s.status !== "submitting" || s.phase !== "uncertain" || s.batchId ||
      s.submissionKey !== args.expectedSubmissionKey ||
      s.inputFileName !== args.expectedInputFileId ||
      s.submissionAttemptedAt !== args.expectedAttemptedAt)
      throw new Error("Uncertain submission identity or state changed.");
    if (Date.now() - args.expectedAttemptedAt < 30 * 60_000)
      throw new Error("Wait at least 30 minutes before operator recovery.");
    const token = randomUUID();
    const claimed = await ctx.runMutation(internal.openAiDurable.claim, {
      segmentId: args.segmentId, token,
    });
    if (!claimed) throw new Error("Submission has an active worker lease; retry after it releases.");
    try {
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const found = await findOpenAiBatchBySubmissionKey({
          submissionKey: args.expectedSubmissionKey,
          inputFileId: args.expectedInputFileId,
          cursor,
          maxPages: 1,
        });
        if (found.matches.length)
          throw new Error("OpenAI has a matching batch by submission key or input file; reconcile it instead of resubmitting.");
        if (found.exhausted) {
          const result = await ctx.runMutation(internal.openAiDurable.replaceUnacceptedSegment, {
            segmentId: args.segmentId,
            expectedSubmissionKey: args.expectedSubmissionKey,
            expectedInputFileId: args.expectedInputFileId,
            expectedAttemptedAt: args.expectedAttemptedAt,
            token,
            verifiedAbsentAt: Date.now(),
          });
          console.info("OpenAI operator submission recovery", result);
          return result;
        }
        if (!found.cursor || found.cursor === cursor)
          throw new Error("OpenAI scan returned an invalid pagination cursor.");
        cursor = found.cursor;
      }
      throw new Error("OpenAI scan is incomplete; no submission was replaced.");
    } finally {
      await ctx.runMutation(internal.openAiDurable.checkpoint, {
        segmentId: args.segmentId, token, release: true,
      });
    }
  },
});

export const advance = internalAction({
  args: { segmentId: v.id("generationBatchSegments") },
  returns: v.object({ done: v.boolean(), delayMs: v.number() }),
  handler: async (ctx, args): Promise<{ done: boolean; delayMs: number }> => {
    const token = randomUUID();
    const data = await ctx.runQuery(internal.openAiDurable.context, args);
    // Cancellation must continue reconciling an in-flight create. This branch
    // only reads provider state or cancels accepted work; it never creates work.
    if (
      data &&
      ["cancelled", "failed"].includes(data.job.status) &&
      data.segment.status === "cancelled" &&
      data.segment.submissionAttemptedAt &&
      !data.segment.submissionRejected &&
      !data.segment.cancellationReconciled
    ) {
      const s = data.segment;
      if (!s.batchId) {
        const found = await findOpenAiBatchBySubmissionKey({
          submissionKey: s.submissionKey!,
          cursor: s.reconcileCursor ?? undefined,
          maxPages: 1,
        });
        const matches = Array.from(
          new Set([
            ...(s.reconcileMatches ?? []),
            ...found.matches
              .filter((m) => m.inputFileId === s.inputFileName)
              .map((m) => m.batchId),
          ]),
        );
        if (found.exhausted && matches.length === 1)
          await ctx.runMutation(internal.openAiDurable.saveReceipt, {
            ...args,
            batchId: matches[0],
            submissionKey: s.submissionKey!,
            inputFileId: s.inputFileName!,
          });
        await ctx.runMutation(internal.openAiDurable.cancelledCheckpoint, {
          ...args,
          cursor: found.exhausted ? null : found.cursor,
          matches: found.exhausted && matches.length < 2 ? [] : matches,
        });
        return { done: false, delayMs: found.exhausted ? 60_000 : 1_000 };
      }
      const state = await getOpenAiBatchState(s.batchId);
      const batchStatus = ["validating", "in_progress", "finalizing"].includes(
        state.batchStatus,
      )
        ? await cancelOpenAiBatch(s.batchId)
        : state.batchStatus;
      const done = ["completed", "failed", "expired", "cancelled"].includes(
        batchStatus ?? "",
      );
      await ctx.runMutation(internal.openAiDurable.cancelledCheckpoint, {
        ...args,
        cursor: null,
        matches: [],
        done,
        batchStatus: batchStatus ?? undefined,
      });
      return { done, delayMs: done ? 0 : 120_000 };
    }
    // Another task/retry can fail a bulk while its provider work is still in
    // flight. Release unsubmitted work, but confirm accepted work's cancellation
    // before allowing another paid attempt or reusing its global slot.
    if (
      data?.job.status === "failed" &&
      data.segment.phase !== "recovering" &&
      !["cancelled", "failed", "completed"].includes(data.segment.status)
    ) {
      const pending = await ctx.runMutation(
        internal.openAiDurable.stopFailedSegment,
        args,
      );
      return { done: !pending, delayMs: 0 };
    }
    const claimed = await ctx.runMutation(internal.openAiDurable.claim, {
      ...args,
      token,
    });
    if (
      !data ||
      ["cancelled", "completed", "failed"].includes(data.segment.status) ||
      data.job.status === "cancelled"
    )
      return { done: true, delayMs: 0 };
    if (data.job.status !== "running") {
      if (
        claimed &&
        (data.segment.phase === "recovering" || data.segment.submissionRejected)
      ) {
        await ctx.runMutation(internal.openAiDurable.finish, {
          ...args,
          token,
        });
      }
      return { done: true, delayMs: 0 };
    }
    if (!claimed) return { done: false, delayMs: 30_000 };
    const { job, images } = data;
    const segment = claimed;
    const checkpoint = async (
      patch: Omit<
        FunctionArgs<typeof internal.openAiDurable.checkpoint>,
        "segmentId" | "token"
      >,
    ) =>
      ctx.runMutation(internal.openAiDurable.checkpoint, {
        ...args,
        token,
        ...patch,
      });
    const settings: Record<string, unknown> = await ctx.runQuery(
      internal.settings.internalList,
      { shopId: job.shopId ?? null },
    );
    try {
      if (segment.phase === "preparing") {
        // One image per step, at most four references. Sibling images reuse the
        // job+product reference cache, including across segment boundaries.
        const image = images.find(
          (i) => i.status === "queued" && !i.openAiPrepared,
        );
        if (!image) {
          await checkpoint({
            phase: "uploading",
            stepFailures: 0,
            error: null,
          });
          return { done: false, delayMs: 0 };
        }
        const modelReferenceUrl =
          image.modelReferenceUrl ??
          (image.modelReferenceStorageId
            ? await ctx.storage.getUrl(image.modelReferenceStorageId)
            : null);
        const urls = generationInputUrlsForImage({
          ...image,
          modelReferenceUrl,
        });
        if (!urls.length)
          throw new Error("At least one reference image is required.");
        const staged: string[] = [];
        for (const sourceUrl of urls) {
          const ref = await ctx.runMutation(
            internal.openAiDurable.claimReference,
            {
              jobId: job._id,
              productId: image.productId,
              sourceUrl,
              token,
            },
          );
          if (ref.readyUrl) {
            staged.push(ref.readyUrl);
            continue;
          }
          if (!ref.claimed) return { done: false, delayMs: 30_000 };
          const pairs = await prepareOpenAiBatchReferences({
            referenceKey: `${job._id}/${image.productId}`,
            sourceUrls: [sourceUrl],
            onPrepared: async (pair) => {
              await ctx.runMutation(internal.openAiDurable.saveReference, {
                referenceId: ref.referenceId,
                token,
                url: pair.url,
              });
            },
          });
          staged.push(pairs[0].url);
        }
        const useVibe = imageUsesVibe(image, job, settings);
        const product: Doc<"products"> | null = await ctx.runQuery(
          internal.products.internalGet,
          { productId: image.productId },
        );
        const vibe =
          useVibe && product
            ? await ensureProductVibe(ctx, product, staged[0], settings, true)
            : null;
        await ctx.runMutation(internal.openAiDurable.prepared, {
          ...args,
          token,
          imageId: image._id,
          urls: staged,
          prompt: finalPromptForImage(image, vibe, useVibe),
          vibe,
        });
        await checkpoint({ stepFailures: 0, error: null });
        return { done: false, delayMs: 0 };
      }
      if (segment.phase === "uploading") {
        const input = await uploadOpenAiBatchInput({
          images: images.map((i) => ({
            ...i,
            stagedReferenceUrls: i.stagedReferenceUrls ?? [],
          })),
          settings,
          model: images[0]?.imageModel ?? job.imageModel ?? "gpt-image-2",
          submissionKey: segment.submissionKey!,
        });
        await checkpoint({
          inputFileName: input.inputFileId,
          phase: "submitting",
          stepFailures: 0,
          error: null,
        });
        // This checkpoint records intent but the create fence belongs to the
        // next execution, so an upload replay cannot accidentally dispatch.
        return { done: false, delayMs: 0 };
      }
      if (segment.phase === "submitting" && !segment.submissionAttemptedAt) {
        const fenced = await checkpoint({
          phase: "submitting",
          dispatch: true,
        });
        if (!fenced) return { done: true, delayMs: 0 };
        const submitted = await createOpenAiBatchFromFile({
          inputFileId: segment.inputFileName!,
          submissionKey: segment.submissionKey!,
          metadata: { job_id: job._id, segment_id: segment._id },
        });
        await ctx.runMutation(internal.openAiDurable.saveReceipt, {
          ...args,
          inputFileId: segment.inputFileName!,
          submissionKey: segment.submissionKey!,
          batchId: submitted.batchId,
          batchStatus: submitted.batchStatus ?? undefined,
        });
        await checkpoint({
          phase: "waiting",
          batchId: submitted.batchId,
          batchStatus: submitted.batchStatus ?? undefined,
          stepFailures: 0,
          error: null,
        });
        return { done: false, delayMs: 10_000 };
      }
      if (segment.phase === "submitting" || segment.phase === "uncertain") {
        if (segment.batchId) {
          await checkpoint({
            phase: "waiting",
            batchId: segment.batchId,
            error: null,
          });
          return { done: false, delayMs: 10_000 };
        }
        // Metadata listing is a read. An empty page never authorizes another
        // POST: OpenAI has no documented Batch creation idempotency guarantee.
        const found = await findOpenAiBatchBySubmissionKey({
          submissionKey: segment.submissionKey!,
          cursor: segment.reconcileCursor ?? undefined,
          maxPages: 1,
        });
        const matches = Array.from(
          new Set([
            ...(segment.reconcileMatches ?? []),
            ...found.matches
              .filter((m) => m.inputFileId === segment.inputFileName)
              .map((m) => m.batchId),
          ]),
        );
        if (found.exhausted && matches.length === 1) {
          await checkpoint({
            batchId: matches[0],
            phase: "waiting",
            error: null,
            reconcileCursor: null,
            reconcileMatches: [],
            stepFailures: 0,
          });
          return { done: false, delayMs: 10_000 };
        }
        await checkpoint({
          phase: "uncertain",
          reconcileCursor: found.exhausted ? null : found.cursor,
          reconcileMatches:
            found.exhausted && matches.length < 2 ? [] : matches,
          error:
            matches.length > 1
              ? "Multiple OpenAI batches match this submission. Manual reconciliation required."
              : segment.error ?? "Submission uncertain: checking OpenAI before any new submission.",
        });
        return { done: false, delayMs: found.exhausted ? 300_000 : 1_000 };
      }
      if (segment.phase === "waiting") {
        const state = await getOpenAiBatchState(segment.batchId!);
        if (
          !["completed", "failed", "expired", "cancelled"].includes(
            state.batchStatus,
          )
        ) {
          await checkpoint({
            batchStatus: state.batchStatus,
            error: null,
            stepFailures: 0,
          });
          return { done: false, delayMs: 120_000 };
        }
        await checkpoint({
          phase: "recovering",
          batchStatus: state.batchStatus,
          outputFileId: state.outputFileId,
          errorFileId: state.errorFileId,
          error: state.error ?? null,
          resultFileIndex: 0,
          resultOffset: 0,
          stepFailures: 0,
        });
        await ctx.runMutation(internal.jobs.markFirstResultReady, {
          jobId: job._id,
        });
        return { done: false, delayMs: 0 };
      }
      if (segment.phase === "recovering") {
        const index = segment.resultFileIndex ?? 0;
        const fileId = [segment.outputFileId, segment.errorFileId][index];
        if (index >= 2) {
          await ctx.runMutation(internal.openAiDurable.finish, {
            ...args,
            token,
            ...(segment.error ? { error: segment.error } : {}),
          });
          return { done: true, delayMs: 0 };
        }
        if (!fileId) {
          await checkpoint({ resultFileIndex: index + 1, resultOffset: 0 });
          return { done: false, delayMs: 0 };
        }
        const byId = new Map(images.map((i) => [i._id as string, i]));
        const page = await ingestOpenAiBatchFilePage({
          fileId,
          byteOffset: segment.resultOffset ?? 0,
          settings,
          maxItems: 2,
          onItem: async (imageId, item, offset) => {
            const image = byId.get(imageId);
            if (
              image &&
              image.status === "generating" &&
              image.providerBatchId === segment.batchId
            ) {
              await ingestBatchItem(
                ctx,
                { ...job, batchId: segment.batchId },
                image,
                item,
              );
            }
            await checkpoint({ resultOffset: offset });
          },
        });
        await checkpoint({
          resultOffset: page.done ? 0 : page.byteOffset,
          resultFileIndex: page.done ? index + 1 : index,
          stepFailures: 0,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.generation.processPostprocessingJob,
          { jobId: job._id },
        );
        return { done: false, delayMs: 0 };
      }
      throw new Error(`Unexpected OpenAI phase: ${segment.phase}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof OpenAiBatchRejectedError) {
        await ctx.runMutation(internal.openAiDurable.saveRejection, {
          ...args,
          submissionKey: segment.submissionKey!,
          inputFileId: segment.inputFileName!,
          error: message,
        });
        await ctx.runMutation(internal.openAiDurable.finish, {
          ...args,
          token,
          error: message,
        });
        return { done: true, delayMs: 0 };
      }
      if (segment.phase === "submitting" || segment.phase === "uncertain") {
        if (segment.phase === "submitting") console.warn("OpenAI batch submission uncertain", {
          segmentId: segment._id,
          submissionKey: segment.submissionKey,
          inputFileId: segment.inputFileName,
          error: message,
        });
        await checkpoint({
          phase: "uncertain",
          error: segment.error ?? `Submission uncertain: ${message}`,
        });
        return { done: false, delayMs: 60_000 };
      }
      const failures = (segment.stepFailures ?? 0) + 1;
      await checkpoint({ stepFailures: failures, error: message });
      if (failures >= 5 && segment.phase !== "waiting") {
        await ctx.runMutation(internal.openAiDurable.finish, {
          ...args,
          token,
          error: message,
          resumeResults: segment.phase === "recovering",
        });
        return { done: true, delayMs: 0 };
      }
      return {
        done: false,
        delayMs: Math.min(120_000, 15_000 * 2 ** failures),
      };
    } finally {
      await checkpoint({ release: true });
    }
  },
});

export const startJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.openAiDurable.initialize, {
      ...args,
      batchSize: intEnv("OPENAI_BATCH_SEGMENT_SIZE", 100),
      concurrency: intEnv("OPENAI_BATCH_MAX_CONCURRENT", 2),
    });
    return null;
  },
});
