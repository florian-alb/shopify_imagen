// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { ingestBatchItem } from "../../generation/batchIngestion";
import { uploadToR2 } from "../../generation/storage";

vi.mock("../../generation/storage", () => ({ uploadToR2: vi.fn() }));

beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

const image = { _id: "image", status: "generating", providerBatchId: "batch", imageType: "Hero" } as Doc<"generatedImages">;
const job = { _id: "job", batchId: "batch", imageProvider: "openai", executionMode: "batch", openAiDurable: true } as Doc<"generationJobs">;
const item = { bytes: Buffer.from("result"), contentType: "image/jpeg" };

function context(current = image) {
  const runQuery = vi.fn(async () => current);
  const runMutation = vi.fn(async (_reference: unknown, _args: Record<string, unknown>) => true);
  return { ctx: { runQuery, runMutation } as unknown as ActionCtx, runMutation };
}

test("a duplicate result or error cannot overwrite an image already in postprocessing", async () => {
  const { ctx, runMutation } = context({ ...image, status: "postprocessing" });
  await expect(ingestBatchItem(ctx, job, image, item)).resolves.toEqual({ ingested: 0, failed: 0 });
  await expect(ingestBatchItem(ctx, job, image, { error: "Duplicate error row" })).resolves.toEqual({ ingested: 0, failed: 0 });
  expect(uploadToR2).not.toHaveBeenCalled();
  expect(runMutation).not.toHaveBeenCalled();
});

test("a result from an earlier batch is fenced before any upload", async () => {
  const { ctx, runMutation } = context({ ...image, providerBatchId: "new-batch" });
  await expect(ingestBatchItem(ctx, job, image, item)).resolves.toEqual({ ingested: 0, failed: 0 });
  expect(uploadToR2).not.toHaveBeenCalled();
  expect(runMutation).not.toHaveBeenCalled();
});

test("a retry that cleared the provider id is fenced by its segment before any upload", async () => {
  const snapshot = { ...image, batchSegmentId: "old-segment" };
  const { ctx, runMutation } = context({ ...image, batchSegmentId: null, providerBatchId: null });
  await expect(ingestBatchItem(ctx, job, snapshot, item)).resolves.toEqual({ ingested: 0, failed: 0 });
  expect(uploadToR2).not.toHaveBeenCalled();
  expect(runMutation).not.toHaveBeenCalled();
});

test("a durable staging failure preserves the task and retries the same output object", async () => {
  const { ctx, runMutation } = context();
  vi.mocked(uploadToR2).mockRejectedValueOnce(new Error("Temporary storage outage"));
  await expect(ingestBatchItem(ctx, job, image, item)).rejects.toThrow("Temporary storage outage");
  expect(runMutation).not.toHaveBeenCalled();
  vi.mocked(uploadToR2).mockResolvedValueOnce("https://r2.example/result.jpg");
  await expect(ingestBatchItem(ctx, job, image, item)).resolves.toEqual({ ingested: 1, failed: 0 });
  expect(uploadToR2).toHaveBeenCalledTimes(2);
  expect(vi.mocked(uploadToR2).mock.calls[0][0].key).toBe(vi.mocked(uploadToR2).mock.calls[1][0].key);
  expect(runMutation).toHaveBeenCalledOnce();
  expect(runMutation.mock.calls[0][1]).toMatchObject({ imageId: "image", inputUrl: "https://r2.example/result.jpg", providerBatchId: "batch", expectedSegmentId: null });
});
