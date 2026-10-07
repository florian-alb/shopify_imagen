"use node";

import { createHash } from "node:crypto";
import { openAiUsage, OUTPUT_FORMAT_TO_MIME } from "./formats";
import { normalizeReferenceImage } from "./images";
import { uploadToR2 } from "./storage";
import { env } from "./runtime";
import { withRequestTimeout } from "./requestTimeout";
import type { BatchItem } from "./batchTypes";

const BASE_URL = "https://api.openai.com/v1";
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const OPENAI_BATCH_MAX_RESULT_LINE_BYTES = 32 * 1024 * 1024;

type PreparedReference = { sourceUrl: string; url: string };
type InputImage = {
  _id: string;
  promptUsed: string;
  finalPromptUsed?: string | null;
  stagedReferenceUrls: string[];
};

export class OpenAiBatchSubmissionUncertainError extends Error {
  readonly submissionUncertain = true;

  constructor(message: string) {
    super(message);
    this.name = "OpenAiBatchSubmissionUncertainError";
  }
}

export class OpenAiBatchRejectedError extends Error {
  readonly submissionRejected = true;
}

function authorization() {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  return { Authorization: `Bearer ${apiKey}` };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function durableOpenAiReferenceKey(referenceKey: string, sourceUrl: string) {
  return `durable-batch-references/${hash(referenceKey)}/${hash(sourceUrl)}.jpg`;
}

// Persist each entry in onPrepared before downloading the next reference. A
// deterministic object URL closes the upload/commit interruption window too.
export async function prepareOpenAiBatchReferences(args: {
  referenceKey: string;
  sourceUrls: string[];
  existing?: PreparedReference[];
  onPrepared?: (reference: PreparedReference) => Promise<void>;
}): Promise<PreparedReference[]> {
  return withRequestTimeout("OpenAI reference preparation", 120_000, async (signal) => {
    const result: PreparedReference[] = [];
    const cached = new Map(args.existing?.map((entry) => [entry.sourceUrl, entry.url]));
    for (const sourceUrl of new Set(args.sourceUrls)) {
      signal.throwIfAborted();
      let url = cached.get(sourceUrl);
      const key = durableOpenAiReferenceKey(args.referenceKey, sourceUrl);
      if (!url) {
        const publicBase = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
        if (publicBase) {
          const stagedUrl = `${publicBase}/${key}`;
          const response = await fetch(stagedUrl, { method: "HEAD", signal });
          await response.body?.cancel();
          if (response.ok) url = stagedUrl;
          else if (response.status !== 404 && response.status !== 405) {
            throw new Error(`OpenAI staged reference check failed (${response.status}).`);
          }
        }
        if (!url) {
          const bytes = await normalizeReferenceImage(sourceUrl, signal, { maxBytes: 20 * 1024 * 1024, maxPixels: 16_000_000 });
          url = await uploadToR2({ bytes, key, contentType: "image/jpeg", signal });
        }
      }
      const pair = { sourceUrl, url };
      await args.onPrepared?.(pair);
      result.push(pair);
      cached.set(sourceUrl, url);
    }
    return result;
  });
}

export function openAiBatchInputJsonl(args: {
  images: InputImage[];
  settings: Record<string, unknown>;
  model: string;
}): string {
  if (args.images.length < 1 || args.images.length > 500) {
    throw new Error("OpenAI batch input must contain between 1 and 500 images.");
  }
  const ids = new Set<string>();
  let bytes = 0;
  const lines: string[] = [];
  for (const image of args.images) {
    if (ids.has(image._id)) throw new Error("OpenAI batch input contains a duplicate image id.");
    ids.add(image._id);
    if (!image.stagedReferenceUrls.length || image.stagedReferenceUrls.length > 4) {
      throw new Error("OpenAI batch input requires between 1 and 4 staged references per image.");
    }
    const line = JSON.stringify({
      custom_id: image._id,
      method: "POST",
      url: "/v1/images/edits",
      body: {
        model: args.model,
        prompt: image.finalPromptUsed ?? image.promptUsed,
        n: 1,
        size: String(args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024")),
        quality: String(args.settings.OPENAI_IMAGE_QUALITY ?? env("OPENAI_IMAGE_QUALITY", "medium")),
        output_format: String(args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")).toLowerCase(),
        images: image.stagedReferenceUrls.map((image_url) => ({ image_url })),
      },
    });
    bytes += Buffer.byteLength(line, "utf8") + 1;
    if (bytes > MAX_INPUT_BYTES) throw new Error("OpenAI batch input exceeds the 8 MiB preparation limit; reduce segment size.");
    lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}

type BatchObject = {
  id?: string;
  status?: string;
  input_file_id?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  metadata?: Record<string, string> | null;
  errors?: { data?: Array<{ message?: string }> };
  error?: { message?: string };
};

export async function uploadOpenAiBatchInput(args: {
  images: InputImage[];
  settings: Record<string, unknown>;
  model: string;
  submissionKey: string;
}): Promise<{ inputFileId: string }> {
  const headers = authorization();
  const jsonl = openAiBatchInputJsonl(args);
  return withRequestTimeout("OpenAI batch input upload", 120_000, async (signal) => {
    const form = new FormData();
    form.append("purpose", "batch");
    form.append("file", new Blob([jsonl], { type: "application/jsonl" }), `imagen-${hash(args.submissionKey)}.jsonl`);
    const response = await fetch(`${BASE_URL}/files`, { method: "POST", headers, body: form, signal });
    const payload = await response.json().catch(() => null) as BatchObject | null;
    if (!response.ok || !payload?.id) {
      throw new Error(`OpenAI batch file upload failed (${response.status}): ${payload?.error?.message ?? "no file id."}`);
    }
    return { inputFileId: payload.id };
  });
}

// There is deliberately no automatic retry around POST /batches. Neither
// metadata nor a client key is a documented server-side idempotency guarantee.
export async function createOpenAiBatchFromFile(args: {
  inputFileId: string;
  submissionKey: string;
  metadata?: Record<string, string>;
}): Promise<{ batchId: string; batchStatus: string | null }> {
  let headers: ReturnType<typeof authorization>;
  try { headers = authorization(); } catch (error) {
    throw new OpenAiBatchRejectedError(error instanceof Error ? error.message : String(error));
  }
  if (!args.inputFileId || !args.submissionKey || args.submissionKey.length > 512) {
    throw new OpenAiBatchRejectedError("Invalid OpenAI batch input file or submission key.");
  }
  try {
    return await withRequestTimeout("OpenAI batch creation", 60_000, async (signal) => {
      const response = await fetch(`${BASE_URL}/batches`, {
        method: "POST", signal,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          input_file_id: args.inputFileId,
          endpoint: "/v1/images/edits",
          completion_window: "24h",
          metadata: { ...args.metadata, submission_key: args.submissionKey },
        }),
      });
      const payload = await response.json().catch(() => null) as BatchObject | null;
      if (!response.ok || !payload?.id) {
        const message = `OpenAI batch creation failed (${response.status}): ${payload?.error?.message ?? "no batch id."}`;
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          throw new OpenAiBatchRejectedError(message);
        }
        throw new OpenAiBatchSubmissionUncertainError(message);
      }
      return { batchId: payload.id, batchStatus: payload.status ?? null };
    });
  } catch (error) {
    if (error instanceof OpenAiBatchRejectedError || error instanceof OpenAiBatchSubmissionUncertainError) throw error;
    throw new OpenAiBatchSubmissionUncertainError(
      `OpenAI batch acceptance is uncertain: ${error instanceof Error ? error.message : String(error)} Reconcile the submission key before taking any further action.`,
    );
  }
}

export async function findOpenAiBatchBySubmissionKey(args: {
  submissionKey: string;
  cursor?: string | null;
  maxPages?: number;
}): Promise<{
  matches: Array<{ batchId: string; batchStatus: string | null; inputFileId: string | null }>;
  cursor: string | null;
  exhausted: boolean;
}> {
  const headers = authorization();
  return withRequestTimeout("OpenAI batch reconciliation", 60_000, async (signal) => {
    const matches: Array<{ batchId: string; batchStatus: string | null; inputFileId: string | null }> = [];
    let cursor = args.cursor ?? null;
    for (let page = 0; page < Math.max(1, Math.min(args.maxPages ?? 1, 5)); page++) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("after", cursor);
      const response = await fetch(`${BASE_URL}/batches?${query}`, { headers, signal });
      const payload = await response.json().catch(() => null) as { data?: BatchObject[]; has_more?: boolean; last_id?: string; error?: { message?: string } } | null;
      if (!response.ok || !Array.isArray(payload?.data)) {
        throw new Error(`OpenAI batch reconciliation failed (${response.status}): ${payload?.error?.message ?? "invalid batch list."}`);
      }
      for (const batch of payload.data) {
        if (batch.metadata?.submission_key === args.submissionKey && batch.id) {
          matches.push({ batchId: batch.id, batchStatus: batch.status ?? null, inputFileId: batch.input_file_id ?? null });
        }
      }
      if (!payload.has_more) return { matches, cursor: null, exhausted: true };
      const next = payload.last_id ?? payload.data[payload.data.length - 1]?.id;
      if (!next || next === cursor) throw new Error("OpenAI batch reconciliation returned an invalid pagination cursor.");
      cursor = next;
    }
    return { matches, cursor, exhausted: false };
  });
}

export async function getOpenAiBatchState(batchId: string): Promise<{
  batchStatus: string;
  inputFileId: string | null;
  metadata: Record<string, string> | null;
  outputFileId: string | null;
  errorFileId: string | null;
  error: string | null;
}> {
  const headers = authorization();
  return withRequestTimeout("OpenAI batch poll", 30_000, async (signal) => {
    const response = await fetch(`${BASE_URL}/batches/${encodeURIComponent(batchId)}`, { headers, signal });
    const payload = await response.json().catch(() => null) as BatchObject | null;
    if (!response.ok || !payload?.status) {
      throw new Error(`OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "invalid batch state."}`);
    }
    const detail = payload.errors?.data?.map((entry) => entry.message).filter(Boolean).join("; ") || payload.error?.message || null;
    return { batchStatus: payload.status, inputFileId: payload.input_file_id ?? null, metadata: payload.metadata ?? null,
      outputFileId: payload.output_file_id ?? null, errorFileId: payload.error_file_id ?? null, error: detail };
  });
}

function parseResult(line: Buffer, settings: Record<string, unknown>): { imageId: string; item: BatchItem } {
  let payload: {
    custom_id?: string; id?: string; error?: { message?: string };
    response?: { status_code?: number; request_id?: string; body?: { id?: string; error?: { message?: string }; data?: Array<{ b64_json?: string }>; usage?: unknown } };
  };
  try { payload = JSON.parse(line.toString("utf8")); }
  catch { throw new Error("OpenAI batch result contains invalid JSONL; cursor was not advanced."); }
  if (!payload.custom_id) throw new Error("OpenAI batch result has no custom_id; cursor was not advanced.");
  const providerIds = { providerRequestId: payload.id ?? payload.response?.request_id ?? null, providerResponseId: payload.response?.body?.id ?? null };
  if (payload.error || (payload.response?.status_code ?? 200) >= 400) {
    return { imageId: payload.custom_id, item: { ...providerIds, error: payload.error?.message ?? payload.response?.body?.error?.message ?? "OpenAI batch item failed." } };
  }
  const b64 = payload.response?.body?.data?.[0]?.b64_json;
  if (!b64) return { imageId: payload.custom_id, item: { ...providerIds, error: "OpenAI batch returned no image data." } };
  const format = String(settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")).toLowerCase();
  return { imageId: payload.custom_id, item: { bytes: Buffer.from(b64, "base64"), ...(OUTPUT_FORMAT_TO_MIME[format] ?? OUTPUT_FORMAT_TO_MIME.jpeg), usage: openAiUsage(payload.response?.body?.usage), ...providerIds } };
}

// Only one JSONL row + one decoded image is retained. onItem must commit its
// result and cursor atomically; replay after an interruption is then harmless.
// Files API does not document Range support. A 200 response streams/discards
// the prefix, while a 206 is accepted only when its start matches the cursor.
export async function ingestOpenAiBatchFilePage(args: {
  fileId: string;
  byteOffset: number;
  settings: Record<string, unknown>;
  maxItems?: number;
  maxLineBytes?: number;
  onItem: (imageId: string, item: BatchItem, nextByteOffset: number) => Promise<void>;
}): Promise<{ byteOffset: number; done: boolean; processed: number }> {
  if (!Number.isSafeInteger(args.byteOffset) || args.byteOffset < 0) throw new Error("Invalid OpenAI result byte cursor.");
  const headers = authorization();
  const maxItems = Math.max(1, Math.min(args.maxItems ?? 2, 100));
  const maxLineBytes = Math.max(1024, Math.min(args.maxLineBytes ?? OPENAI_BATCH_MAX_RESULT_LINE_BYTES, OPENAI_BATCH_MAX_RESULT_LINE_BYTES));
  return withRequestTimeout("OpenAI batch result retrieval", 240_000, async (signal) => {
    const response = await fetch(`${BASE_URL}/files/${encodeURIComponent(args.fileId)}/content`, {
      headers: { ...headers, ...(args.byteOffset ? { Range: `bytes=${args.byteOffset}-` } : {}) }, signal,
    });
    if (response.status === 416) {
      const total = /^bytes \*\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
      await response.body?.cancel();
      if (total && args.byteOffset === Number(total[1])) return { byteOffset: args.byteOffset, done: true, processed: 0 };
      throw new Error("OpenAI batch result byte cursor is beyond the end of the file.");
    }
    if (!response.ok || !response.body) throw new Error(`OpenAI batch result download failed (${response.status}).`);
    let skip = args.byteOffset;
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get("content-range") ?? "");
      if (!range || Number(range[1]) !== args.byteOffset) {
        await response.body.cancel();
        throw new Error("OpenAI batch result returned an inconsistent Content-Range; cursor was not advanced.");
      }
      skip = 0;
    }
    const reader = response.body.getReader();
    let byteOffset = args.byteOffset;
    let processed = 0;
    let fragments: Uint8Array[] = [];
    let lineBytes = 0;
    const consume = async (terminated: boolean) => {
      const raw = Buffer.concat(fragments, lineBytes);
      const nextByteOffset = byteOffset + lineBytes + (terminated ? 1 : 0);
      if (raw.some((byte) => byte !== 13 && byte !== 9 && byte !== 32)) {
        const { imageId, item } = parseResult(raw, args.settings);
        await args.onItem(imageId, item, nextByteOffset);
        processed++;
      }
      byteOffset = nextByteOffset;
      fragments = [];
      lineBytes = 0;
    };
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          if (skip) throw new Error("OpenAI batch result is shorter than its persisted cursor.");
          if (lineBytes) await consume(false);
          return { byteOffset, done: true, processed };
        }
        let start = 0;
        if (skip) {
          start = Math.min(skip, value.length);
          skip -= start;
        }
        for (let index = start; index < value.length; index++) {
          if (value[index] !== 10) continue;
          const fragment = value.subarray(start, index);
          lineBytes += fragment.length;
          if (lineBytes > maxLineBytes) throw new Error(`OpenAI batch result row exceeds ${maxLineBytes} bytes; cursor was not advanced.`);
          fragments.push(fragment);
          await consume(true);
          start = index + 1;
          if (processed >= maxItems) return { byteOffset, done: false, processed };
        }
        if (start < value.length) {
          const fragment = value.subarray(start);
          lineBytes += fragment.length;
          if (lineBytes > maxLineBytes) throw new Error(`OpenAI batch result row exceeds ${maxLineBytes} bytes; cursor was not advanced.`);
          // Copy small tails so a retained fragment does not pin a large chunk.
          fragments.push(new Uint8Array(fragment));
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  });
}
