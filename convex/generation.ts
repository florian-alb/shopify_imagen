"use node";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import sharp from "sharp";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { augmentPrompt, buildSeoImageFilename } from "./lib";
import { BATCH_PRICE_MULTIPLIER, estimateCostUsd, type TokenUsage } from "./pricing";

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function intEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Structured, greppable logging for the generation pipeline. Shows up in the
// Convex logs / dashboard so generations can be traced end to end.
function log(scope: string, message: string, data?: Record<string, unknown>) {
  const suffix = data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
  console.log(`[gen:${scope}] ${message}${suffix}`);
}

function waitFromRateLimitMessage(message: string, minimumMs: number) {
  const match = message.match(/(?:try|retry)(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) + 1250 : minimumMs;
}

async function mapConcurrent<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function normalizeReferenceImage(sourceUrl: string) {
  let response: Response;
  try {
    response = await fetch(sourceUrl);
  } catch (err) {
    throw new Error(`Network error fetching reference image from ${sourceUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) throw new Error(`Failed to download supplier reference image (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  // sharp (not jimp) so WebP/AVIF reference images decode correctly — jimp 1.x
  // has no WebP codec and throws "Could not find MIME for Buffer" on them. Fit
  // within 1024px, flatten any transparency onto white, output JPEG.
  return sharp(bytes)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toColorspace("srgb")
    .toBuffer();
}

type ProviderIds = {
  providerBatchId?: string | null;
  providerRequestId?: string | null;
  providerResponseId?: string | null;
};
type GeneratedImage = { bytes: Buffer; contentType: string; extension: string; usage: TokenUsage } & ProviderIds;

function providerIdsFromResponse(response: Response, payload?: unknown): ProviderIds {
  // OpenAI reliably exposes x-request-id. Google APIs vary by surface, so keep
  // the first request/trace header available for support correlation.
  const providerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    response.headers.get("x-google-request-id") ??
    response.headers.get("x-cloud-trace-context") ??
    null;
  const body = payload as { id?: string; responseId?: string; response_id?: string } | null | undefined;
  return {
    providerRequestId,
    providerResponseId: body?.id ?? body?.responseId ?? body?.response_id ?? null
  };
}

class ProviderGenerationError extends Error {
  providerIds: ProviderIds;

  constructor(message: string, providerIds: ProviderIds) {
    super(message);
    this.providerIds = providerIds;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geminiUsage(meta: any): TokenUsage {
  return { inputTokens: meta?.promptTokenCount ?? 0, outputTokens: meta?.candidatesTokenCount ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function openAiUsage(usage: any): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    inputTextTokens: usage?.input_tokens_details?.text_tokens,
    inputImageTokens: usage?.input_tokens_details?.image_tokens
  };
}

const OUTPUT_FORMAT_TO_MIME: Record<string, { contentType: string; extension: string }> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  jpg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" }
};

async function generateWithOpenAi(args: {
  prompt: string;
  sourceImageUrl: string;
  sourceImageUrl2?: string | null;
  model?: string;
  settings: Record<string, unknown>;
}): Promise<GeneratedImage> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const referenceUrls = [args.sourceImageUrl, args.sourceImageUrl2].filter((url): url is string => Boolean(url));
  const outputFormat = String(args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")).toLowerCase();
  const mime = OUTPUT_FORMAT_TO_MIME[outputFormat] ?? OUTPUT_FORMAT_TO_MIME.jpeg;
  const form = new FormData();
  form.append("model", args.model ?? String(args.settings.OPENAI_IMAGE_MODEL ?? env("OPENAI_IMAGE_MODEL", "gpt-image-2-2026-04-21")));
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append("size", String(args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024")));
  form.append("quality", String(args.settings.OPENAI_IMAGE_QUALITY ?? env("OPENAI_IMAGE_QUALITY", "medium")));
  form.append("output_format", outputFormat);
  // gpt-image edits accept multiple reference images via repeated image[] parts;
  // a single reference keeps the original "image" field name.
  const imageField = referenceUrls.length > 1 ? "image[]" : "image";
  for (let index = 0; index < referenceUrls.length; index += 1) {
    const referenceBytes = await normalizeReferenceImage(referenceUrls[index]);
    form.append(imageField, new Blob([new Uint8Array(referenceBytes)], { type: "image/jpeg" }), `reference-${index}.jpg`);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usage?: any;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new ProviderGenerationError(
      `OpenAI image generation failed (${response.status}): ${payload?.error?.message ?? "Unknown error."}`,
      providerIdsFromResponse(response, payload)
    );
  }

  const usage = openAiUsage(payload?.usage);
  const image = payload?.data?.[0];
  const providerIds = providerIdsFromResponse(response, payload);
  if (image?.b64_json) return { bytes: Buffer.from(image.b64_json, "base64"), ...mime, usage, ...providerIds };
  if (image?.url) {
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`OpenAI returned a URL, but image download failed with ${download.status}.`);
    return { bytes: Buffer.from(await download.arrayBuffer()), ...mime, usage, ...providerIds };
  }
  throw new Error("OpenAI image generation returned no image data.");
}

function mimeToExtension(contentType: string) {
  return OUTPUT_FORMAT_TO_MIME[contentType.replace(/^image\//, "").toLowerCase()]?.extension ?? "png";
}

// Shared by the real-time and batch Gemini paths. Gemini only honours an
// imageConfig block when at least one field is set, so omit empty fields.
function buildGeminiGenerationConfig(settings: Record<string, unknown>) {
  const aspectRatio = String(settings.GEMINI_IMAGE_ASPECT_RATIO ?? env("GEMINI_IMAGE_ASPECT_RATIO", "")).trim();
  const imageSize = String(settings.GEMINI_IMAGE_SIZE ?? env("GEMINI_IMAGE_SIZE", "")).trim();
  const generationConfig: Record<string, unknown> = { responseModalities: ["IMAGE"] };
  const imageConfig: Record<string, string> = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (imageSize) imageConfig.imageSize = imageSize;
  if (Object.keys(imageConfig).length > 0) generationConfig.imageConfig = imageConfig;
  return generationConfig;
}

// Normalizes each provided reference URL into a Gemini inline_data image part.
// Skips empty entries so callers can pass [primary, secondary] freely.
async function buildGeminiReferenceParts(urls: Array<string | null | undefined>) {
  const parts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  for (const url of urls) {
    if (!url) continue;
    const bytes = await normalizeReferenceImage(url);
    parts.push({ inline_data: { mime_type: "image/jpeg", data: bytes.toString("base64") } });
  }
  return parts;
}

// Quick, low-cost vision pass: describe the ideal real-world scene for a product
// so the generation prompt stages it correctly (e.g. a kids room, not a salon).
async function analyzeVibe(args: { sourceImageUrl: string; model: string }): Promise<{ text: string; usage: TokenUsage }> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for vibe analysis.");
  const referenceBytes = await normalizeReferenceImage(args.sourceImageUrl);
  const instruction =
    "You are a product photography art director. Look at this product image and describe, in ONE concise sentence, the ideal real-world scene to showcase it: room/setting, target audience, mood, and color palette. Infer the intended end-user context (e.g. a child's bedroom for a kids product, not a generic luxury living room). Reply with the description only, no preamble.";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: instruction }, { inline_data: { mime_type: "image/jpeg", data: referenceBytes.toString("base64") } }]
          }
        ],
        generationConfig: { temperature: 0.4 }
      })
    }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new Error(`Vibe analysis failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part?.text)
    .filter(Boolean)
    .join(" ")
    .trim();
  return { text, usage: geminiUsage(payload?.usageMetadata) };
}

// Ensures a product has a cached vibe, analyzing once when enabled. Returns the
// vibe string (possibly empty). Errors are swallowed so generation still runs.
async function ensureProductVibe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  product: Doc<"products">,
  sourceImageUrl: string | null | undefined,
  settings: Record<string, unknown>,
  enabled: boolean
): Promise<string> {
  if (typeof product.vibe === "string") return product.vibe;
  if (!enabled || !sourceImageUrl) return "";
  const model = String(settings.VIBE_MODEL ?? env("VIBE_MODEL", "gemini-2.5-flash-lite"));
  try {
    const { text, usage } = await analyzeVibe({ sourceImageUrl, model });
    const costUsd = estimateCostUsd(model, usage);
    await ctx.runMutation(internal.products.setVibe, { productId: product._id, vibe: text, costUsd });
    return text;
  } catch {
    // Non-fatal: fall back to no scene context rather than failing the job.
    return "";
  }
}

async function generateWithGemini(args: {
  prompt: string;
  sourceImageUrl: string;
  sourceImageUrl2?: string | null;
  model?: string;
  settings: Record<string, unknown>;
}): Promise<GeneratedImage> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when Nano Banana Pro is selected.");
  const model = args.model ?? String(args.settings.GEMINI_IMAGE_MODEL ?? env("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview"));
  const referenceParts = await buildGeminiReferenceParts([args.sourceImageUrl, args.sourceImageUrl2]);
  const generationConfig = buildGeminiGenerationConfig(args.settings);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: args.prompt }, ...referenceParts]
          }
        ],
        generationConfig
      })
    }
  );
  const payload = (await response.json().catch(() => null)) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mime_type?: string };
        }>;
      };
    }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usageMetadata?: any;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new ProviderGenerationError(
      `Gemini image generation failed (${response.status}): ${payload?.error?.message ?? "Unknown error."}`,
      providerIdsFromResponse(response, payload)
    );
  }

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const data = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const base64 = data?.inlineData?.data ?? data?.inline_data?.data;
  if (!base64) throw new Error("Gemini image generation returned no image data.");
  // Preserve Gemini's native bytes (PNG by default) instead of re-encoding to JPEG.
  const contentType = data?.inlineData?.mimeType ?? data?.inline_data?.mime_type ?? "image/png";
  return {
    bytes: Buffer.from(base64, "base64"),
    contentType,
    extension: mimeToExtension(contentType),
    usage: geminiUsage(payload?.usageMetadata),
    ...providerIdsFromResponse(response, payload)
  };
}

async function uploadToR2(args: { bytes: Buffer; key: string; contentType: string }) {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL are required.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.bytes,
      ContentType: args.contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return `${publicBaseUrl}/${args.key}`;
}

async function deleteFromR2(storageUrl: string) {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return;
  if (!storageUrl.startsWith(`${publicBaseUrl}/`)) return;
  const key = storageUrl.slice(publicBaseUrl.length + 1);
  if (!key) return;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export const deleteFromStorage = internalAction({
  args: { storageUrl: v.string() },
  handler: async (_ctx, args) => {
    await deleteFromR2(args.storageUrl);
  }
});

// Re-encodes generated bytes to an optimized WebP and strips all metadata for
// storage. sharp does not copy EXIF/ICC/XMP unless withMetadata() is called, so
// this both shrinks the file and removes identifying data; .rotate() bakes in
// any EXIF orientation before it is dropped. Falls back to the original bytes
// if WebP encoding is unavailable so a generation never fails on optimization.
async function optimizeForStorage(
  bytes: Buffer,
  originalContentType: string,
  originalExtension: string
): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  try {
    const quality = intEnv("WEBP_QUALITY", 82);
    const webp = await sharp(bytes).rotate().webp({ quality, effort: 4 }).toBuffer();
    return { bytes: webp, contentType: "image/webp", extension: "webp" };
  } catch (error) {
    console.warn(`WebP optimization failed, storing original bytes: ${error instanceof Error ? error.message : String(error)}`);
    return { bytes, contentType: originalContentType, extension: originalExtension };
  }
}

// ---------------------------------------------------------------------------
// Batch generation (asynchronous, ~50% cheaper than real-time)
// ---------------------------------------------------------------------------
type BatchImage = Doc<"generatedImages">;
type BatchItem = { bytes?: Buffer; contentType?: string; error?: string; usage?: TokenUsage } & ProviderIds;
type BatchIngestCounts = { ingested: number; failed: number };
type BatchIngestResult = BatchIngestCounts & { complete: boolean };
type BatchResultSource =
  | { kind: "items"; results: Map<string, BatchItem> }
  | { kind: "gemini-file"; fileName: string }
  | { kind: "gemini-inline"; batchName: string };
type BatchPollResult =
  | { state: "pending"; batchStatus?: string | null }
  | { state: "done"; source: BatchResultSource; batchStatus?: string | null }
  | { state: "failed"; error: string; batchStatus?: string | null }
  | { state: "cancelled"; batchStatus?: string | null };
type TerminalBatchResult =
  | { state: "busy" }
  | { state: "failed"; error: string }
  | { state: "cancelled" }
  | ({ state: "partial" } & BatchIngestCounts)
  | ({ state: "done" } & BatchIngestCounts);
type ManualPollResult = { state: "pending"; batchStatus?: string | null } | TerminalBatchResult;

function isTransientPollStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function geminiBatchStatus(payload: any): string | null {
  const raw = payload?.state ?? payload?.metadata?.state ?? payload?.metadata?.batchState ?? null;
  return typeof raw === "string" && raw ? raw : null;
}

function geminiResponsesFile(payload: any): string | null {
  const raw =
    payload?.response?.responsesFile ??
    payload?.response?.responses_file ??
    payload?.metadata?.output?.responsesFile ??
    payload?.metadata?.output?.responses_file ??
    payload?.dest?.fileName ??
    payload?.dest?.file_name ??
    null;
  return typeof raw === "string" && raw ? raw : null;
}

function isGeminiSucceeded(status: string | null | undefined) {
  return status === "JOB_STATE_SUCCEEDED" || status === "BATCH_STATE_SUCCEEDED" || status === "SUCCEEDED";
}

function isGeminiFailed(status: string | null | undefined) {
  return status === "JOB_STATE_FAILED" || status === "BATCH_STATE_FAILED" || status === "JOB_STATE_EXPIRED" || status === "BATCH_STATE_EXPIRED";
}

function isGeminiCancelled(status: string | null | undefined) {
  return status === "JOB_STATE_CANCELLED" || status === "BATCH_STATE_CANCELLED" || status === "CANCELLED" || status === "CANCELED";
}

function isCancellableBatchStatus(provider: "gemini" | "openai", status: string | null | undefined) {
  if (!status) return true;
  if (provider === "openai") return ["validating", "in_progress", "finalizing"].includes(status);
  return [
    "JOB_STATE_PENDING",
    "BATCH_STATE_PENDING",
    "JOB_STATE_RUNNING",
    "BATCH_STATE_RUNNING",
    "PENDING",
    "RUNNING"
  ].includes(status);
}

async function uploadGeminiFile(args: { apiKey: string; body: string; displayName: string }) {
  const bytes = Buffer.from(args.body);
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": args.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl"
    },
    body: JSON.stringify({ file: { display_name: args.displayName } })
  });
  if (!start.ok) {
    const payload = (await start.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Gemini batch file upload start failed (${start.status}): ${payload?.error?.message ?? "unknown error."}`);
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini batch file upload start returned no upload URL.");

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/jsonl",
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });
  const payload = (await upload.json().catch(() => null)) as { file?: { name?: string }; error?: { message?: string } } | null;
  if (!upload.ok || !payload?.file?.name) {
    throw new Error(`Gemini batch file upload failed (${upload.status}): ${payload?.error?.message ?? "no file name returned."}`);
  }
  return payload.file.name;
}

async function deleteGeminiFile(fileName: string | null | undefined) {
  if (!fileName) return;
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Gemini file cleanup failed (${response.status}) for ${fileName}.`);
  }
}

async function submitGeminiBatch(args: { images: BatchImage[]; settings: Record<string, unknown>; model: string }) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when Nano Banana Pro is selected.");
  const generationConfig = buildGeminiGenerationConfig(args.settings);
  const lines = await mapConcurrent(args.images, 5, async (image) => {
    if (!image.sourceImageUrl) throw new Error("Product has no Shopify supplier image to use as reference.");
    const referenceParts = await buildGeminiReferenceParts([image.sourceImageUrl, image.sourceImageUrl2]);
    return JSON.stringify({
      key: image._id,
      request: {
        contents: [{ role: "user", parts: [{ text: image.promptUsed }, ...referenceParts] }],
        generationConfig
      }
    });
  });
  const displayName = `imagen-${Date.now()}`;
  const inputFileName = await uploadGeminiFile({ apiKey, body: lines.join("\n"), displayName });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:batchGenerateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        batch: { display_name: displayName, input_config: { file_name: inputFileName } }
      })
    }
  );
  const payload = (await response.json().catch(() => null)) as { name?: string; state?: string; metadata?: { state?: string }; error?: { message?: string } } | null;
  if (!response.ok || !payload?.name) {
    await deleteGeminiFile(inputFileName).catch(() => undefined);
    throw new Error(`Gemini batch submission failed (${response.status}): ${payload?.error?.message ?? "no batch name returned."}`);
  }
  return { batchId: payload.name, inputFileName, batchStatus: geminiBatchStatus(payload) }; // e.g. "batches/123456789"
}

async function pollGeminiBatch(batchName: string, inputFileName?: string | null): Promise<BatchPollResult> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  const batchUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
  const response = await fetch(`${batchUrl}?fields=name,metadata,done,error`, {
    headers: { "x-goog-api-key": apiKey }
  });
  const payload = (await response.json().catch(() => null)) as {
    done?: boolean;
    metadata?: { state?: string; batchState?: string; output?: { responsesFile?: string; responses_file?: string } };
    error?: { message?: string };
  } | null;
  const batchStatus = geminiBatchStatus(payload);
  if (!response.ok) {
    if (isTransientPollStatus(response.status)) {
      throw new Error(`Gemini batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`);
    }
    return { state: "failed", error: `Gemini batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`, batchStatus };
  }
  if (isGeminiCancelled(batchStatus)) return { state: "cancelled", batchStatus };
  if (payload?.error) return { state: "failed", error: `Gemini batch failed: ${payload.error.message ?? "unknown error."}`, batchStatus };
  if (isGeminiFailed(batchStatus)) return { state: "failed", error: `Gemini batch ${batchStatus}.`, batchStatus };
  if (!payload?.done && !isGeminiSucceeded(batchStatus)) return { state: "pending", batchStatus };

  // New jobs are submitted through File API and return a small JSONL result
  // file. Jobs submitted by older app versions used inline responses; preserve
  // a streaming recovery path for them without loading the operation JSON.
  if (!inputFileName) return { state: "done", source: { kind: "gemini-inline", batchName }, batchStatus };
  const metadataFileName = geminiResponsesFile(payload);
  if (metadataFileName) return { state: "done", source: { kind: "gemini-file", fileName: metadataFileName }, batchStatus };
  const details = await fetch(`${batchUrl}?fields=response,error`, {
    headers: { "x-goog-api-key": apiKey }
  });
  const detailsPayload = (await details.json().catch(() => null)) as {
    response?: { responsesFile?: string; responses_file?: string };
    error?: { message?: string };
  } | null;
  if (!details.ok) {
    if (isTransientPollStatus(details.status)) {
      throw new Error(`Gemini batch result lookup failed (${details.status}): ${detailsPayload?.error?.message ?? "unknown error."}`);
    }
    return { state: "failed", error: `Gemini batch result lookup failed (${details.status}): ${detailsPayload?.error?.message ?? "unknown error."}`, batchStatus };
  }
  if (detailsPayload?.error) return { state: "failed", error: `Gemini batch result lookup failed (${details.status}): ${detailsPayload.error.message ?? "unknown error."}`, batchStatus };
  const fileName = geminiResponsesFile(detailsPayload);
  if (!fileName) return { state: "failed", error: "Gemini batch completed without a response file.", batchStatus };
  return { state: "done", source: { kind: "gemini-file", fileName }, batchStatus };
}

async function submitOpenAiBatch(args: { images: BatchImage[]; settings: Record<string, unknown>; model: string }) {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const size = String(args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024"));
  const quality = String(args.settings.OPENAI_IMAGE_QUALITY ?? env("OPENAI_IMAGE_QUALITY", "medium"));
  const outputFormat = String(args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")).toLowerCase();

  // Batch JSONL cannot carry multipart uploads, so the reference image must be
  // passed by URL. Normalize like the realtime path, stage it on R2, then send
  // it under the JSON `images` array the edits endpoint requires (each entry is
  // an object { image_url }, even for a single reference).
  const lines = await mapConcurrent(args.images, 5, async (image) => {
    if (!image.sourceImageUrl) throw new Error("Product has no Shopify supplier image to use as reference.");
    const referenceUrls = [image.sourceImageUrl, image.sourceImageUrl2].filter((url): url is string => Boolean(url));
    const staged: Array<{ image_url: string }> = [];
    for (let index = 0; index < referenceUrls.length; index += 1) {
      const referenceBytes = await normalizeReferenceImage(referenceUrls[index]);
      const referenceUrl = await uploadToR2({
        bytes: referenceBytes,
        key: `batch-references/${image._id}-${index}.jpg`,
        contentType: "image/jpeg"
      });
      staged.push({ image_url: referenceUrl });
    }
    return JSON.stringify({
      custom_id: image._id,
      method: "POST",
      url: "/v1/images/edits",
      body: {
        model: args.model,
        prompt: image.promptUsed,
        n: 1,
        size,
        quality,
        output_format: outputFormat,
        images: staged
      }
    });
  });

  const fileForm = new FormData();
  fileForm.append("purpose", "batch");
  fileForm.append("file", new Blob([lines.join("\n")], { type: "application/jsonl" }), `imagen-${Date.now()}.jsonl`);
  const fileResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fileForm
  });
  const filePayload = (await fileResponse.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!fileResponse.ok || !filePayload?.id) {
    throw new Error(`OpenAI batch file upload failed (${fileResponse.status}): ${filePayload?.error?.message ?? "no file id."}`);
  }

  const batchResponse = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input_file_id: filePayload.id, endpoint: "/v1/images/edits", completion_window: "24h" })
  });
  const batchPayload = (await batchResponse.json().catch(() => null)) as { id?: string; status?: string; error?: { message?: string } } | null;
  if (!batchResponse.ok || !batchPayload?.id) {
    throw new Error(`OpenAI batch creation failed (${batchResponse.status}): ${batchPayload?.error?.message ?? "no batch id."}`);
  }
  return { batchId: batchPayload.id, batchStatus: batchPayload.status ?? null };
}

async function pollOpenAiBatch(batchId: string, settings: Record<string, unknown>): Promise<BatchPollResult> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    if (isTransientPollStatus(response.status)) {
      throw new Error(`OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`);
    }
    return { state: "failed", error: `OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}` };
  }
  const status: string = payload?.status ?? "";
  const batchStatus = status || null;
  if (status === "failed" || status === "expired" || status === "cancelled") {
    // Surface the batch-level errors (e.g. unsupported model) instead of a
    // generic status, so the cause is visible directly in the logs.
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload?.errors?.data ?? []).map((entry: any) => entry?.message).filter(Boolean).join("; ") ||
      payload?.error?.message ||
      "";
    if (status === "cancelled") return { state: "cancelled", batchStatus };
    return { state: "failed", error: `OpenAI batch ${status}${detail ? `: ${detail}` : "."}`, batchStatus };
  }
  if (status !== "completed") return { state: "pending", batchStatus };

  const outputFormat = String(settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")).toLowerCase();
  const mime = OUTPUT_FORMAT_TO_MIME[outputFormat] ?? OUTPUT_FORMAT_TO_MIME.jpeg;
  const results = new Map<string, BatchItem>();

  const ingest = async (fileId: string | undefined) => {
    if (!fileId) return;
    const content = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!content.ok) return;
    const text = await content.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const key: string | undefined = parsed?.custom_id;
      if (!key) continue;
      if (parsed?.error || (parsed?.response?.status_code ?? 200) >= 400) {
        results.set(key, {
          providerRequestId: parsed?.id ?? parsed?.response?.request_id ?? null,
          providerResponseId: parsed?.response?.body?.id ?? null,
          error: parsed?.error?.message ?? parsed?.response?.body?.error?.message ?? "OpenAI batch item failed."
        });
        continue;
      }
      const b64 = parsed?.response?.body?.data?.[0]?.b64_json;
      if (!b64) {
        results.set(key, { error: "OpenAI batch returned no image data." });
        continue;
      }
      results.set(key, {
        bytes: Buffer.from(b64, "base64"),
        ...mime,
        usage: openAiUsage(parsed?.response?.body?.usage),
        providerRequestId: parsed?.id ?? parsed?.response?.request_id ?? null,
        providerResponseId: parsed?.response?.body?.id ?? null
      });
    }
  };
  await ingest(payload?.output_file_id);
  await ingest(payload?.error_file_id);
  return { state: "done", source: { kind: "items", results }, batchStatus };
}

async function cancelGeminiBatch(batchName: string): Promise<string | null> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}:cancel`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: "{}"
  });
  const payload = (await response.json().catch(() => null)) as { state?: string; metadata?: { state?: string }; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(`Gemini batch cancel failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`);
  }
  return geminiBatchStatus(payload) ?? "JOB_STATE_CANCELLED";
}

async function cancelOpenAiBatch(batchId: string): Promise<string | null> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const response = await fetch(`https://api.openai.com/v1/batches/${batchId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
  });
  const payload = (await response.json().catch(() => null)) as { status?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(`OpenAI batch cancel failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`);
  }
  return payload?.status ?? "cancelling";
}

export const submitBatch = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
    if (!job || job.status === "cancelled") return;
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const allImages = (await ctx.runQuery(internal.jobs.imagesForJob, { jobId: args.jobId })) as Doc<"generatedImages">[];
    const images = allImages.filter((img) => img.status === "queued");
    if (!images.length) {
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
      return;
    }
    const provider = images[0].imageProvider === "gemini" ? "gemini" : "openai";
    const model = images[0].imageModel ?? (provider === "gemini" ? "gemini-3-pro-image-preview" : "gpt-image-2-2026-04-21");

    // Vibe analysis once per distinct product, then bake the scene context and
    // second-image guidance into each prompt before the batch is submitted.
    const vibeEnabled = job?.vibeAnalysis ?? String(settings.VIBE_ANALYSIS ?? "on") !== "off";
    const vibeByProduct = new Map<string, string>();
    for (const image of images) {
      const pid = image.productId as unknown as string;
      if (vibeByProduct.has(pid)) continue;
      const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
      vibeByProduct.set(pid, product ? await ensureProductVibe(ctx, product, image.sourceImageUrl, settings, vibeEnabled) : "");
    }
    const preparedImages = images.map((image) => ({
      ...image,
      promptUsed: augmentPrompt(image.promptUsed, {
        vibe: vibeByProduct.get(image.productId as unknown as string),
        hasSecondReference: Boolean(image.sourceImageUrl2)
      })
    }));

    log("batch", "submitting", { jobId: args.jobId, count: images.length, provider, model });
    try {
      const submitted =
        provider === "gemini"
          ? await submitGeminiBatch({ images: preparedImages, settings, model })
          : { ...(await submitOpenAiBatch({ images: preparedImages, settings, model })), inputFileName: null };
      await ctx.runMutation(internal.jobs.setBatchInfo, {
        jobId: args.jobId,
        batchId: submitted.batchId,
        batchStatus: submitted.batchStatus,
        batchInputFileName: submitted.inputFileName
      });
      await ctx.runMutation(internal.jobs.markImagesGenerating, { jobId: args.jobId, providerBatchId: submitted.batchId });
      log("batch", "submitted", { jobId: args.jobId, batchId: submitted.batchId, count: images.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("batch", "submit failed", { jobId: args.jobId, error: message, stack: error instanceof Error ? error.stack : undefined });
      try {
        for (const image of images) {
          await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: message });
        }
        await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
      } catch (cleanupError) {
        log("batch", "cleanup failed after submit error", { jobId: args.jobId, cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      }
    }
  }
});

async function ingestBatchItem(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
  result: BatchItem | undefined
): Promise<BatchIngestCounts> {
  if (!result || result.error || !result.bytes) {
    const error = result?.error ?? "No batch result returned for this image.";
    log("batch", "image failed", { jobId: job._id, type: image.imageType, error });
    const changed: boolean = await ctx.runMutation(internal.jobs.failImage, {
      imageId: image._id,
      error,
      providerBatchId: job.batchId,
      providerRequestId: result?.providerRequestId,
      providerResponseId: result?.providerResponseId
    });
    return { ingested: 0, failed: changed ? 1 : 0 };
  }
  try {
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
    const optimized = await optimizeForStorage(result.bytes, result.contentType ?? "image/png", mimeToExtension(result.contentType ?? "image/png"));
    const safeHandle = (product?.handle ?? "product").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const filename = buildSeoImageFilename({ title: product?.title ?? safeHandle, imageType: image.imageType, extension: optimized.extension });
    const key = `generated/${safeHandle}/${Date.now().toString(36)}/${filename}`;
    const storageUrl = await uploadToR2({ bytes: optimized.bytes, key, contentType: optimized.contentType });
    const usage = result.usage ?? {};
    const costUsd = estimateCostUsd(job.imageModel ?? "", usage, { batch: job.executionMode === "batch" });
    const changed: boolean = await ctx.runMutation(internal.jobs.completeImage, {
      imageId: image._id,
      generatedImageUrl: storageUrl,
      storageUrl,
      providerBatchId: job.batchId,
      providerRequestId: result.providerRequestId,
      providerResponseId: result.providerResponseId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
      costRateMultiplier: job.executionMode === "batch" ? BATCH_PRICE_MULTIPLIER : 1
    });
    log("batch", "stored", { jobId: job._id, handle: safeHandle, type: image.imageType, file: filename, kb: Math.round(optimized.bytes.length / 1024), costUsd });
    return { ingested: changed ? 1 : 0, failed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("batch", "image failed", { jobId: job._id, type: image.imageType, error: message });
    const changed: boolean = await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: message, providerBatchId: job.batchId });
    return { ingested: 0, failed: changed ? 1 : 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geminiBatchItem(raw: any): { key?: string; result: BatchItem } {
  const key: string | undefined = raw?.metadata?.key ?? raw?.key;
  const providerRequestId = raw?.id ?? raw?.metadata?.requestId ?? raw?.metadata?.request_id ?? null;
  const providerResponseId = raw?.response?.id ?? raw?.response?.responseId ?? raw?.response?.response_id ?? null;
  if (raw?.error) return { key, result: { error: raw.error.message ?? "Gemini batch item failed.", providerRequestId, providerResponseId } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = raw?.response?.candidates?.[0]?.content?.parts ?? [];
  const data = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const base64 = data?.inlineData?.data ?? data?.inline_data?.data;
  if (!base64) return { key, result: { error: "Gemini batch returned no image data.", providerRequestId, providerResponseId } };
  const contentType = data?.inlineData?.mimeType ?? data?.inline_data?.mime_type ?? "image/png";
  return {
    key,
    result: {
      bytes: Buffer.from(base64, "base64"),
      contentType,
      usage: geminiUsage(raw?.response?.usageMetadata),
      providerRequestId,
      providerResponseId
    }
  };
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

async function consumeJsonLines(
  response: Response,
  startOffset: number,
  onLine: (line: string) => Promise<boolean>,
  onOffset: (offset: number) => Promise<void>
) {
  if (!response.body) throw new Error("Gemini result file returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = new Uint8Array();
  let offset = startOffset;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffered = concatBytes(buffered, value);
    let newline = buffered.indexOf(10);
    while (newline >= 0) {
      const line = decoder.decode(buffered.slice(0, newline)).trim();
      buffered = buffered.slice(newline + 1);
      offset += newline + 1;
      if (line && !(await onLine(line))) {
        await onOffset(offset);
        await reader.cancel();
        return false;
      }
      await onOffset(offset);
      newline = buffered.indexOf(10);
    }
    if (done) break;
  }
  const tail = decoder.decode(buffered).trim();
  if (tail && !(await onLine(tail))) {
    await onOffset(offset + buffered.length);
    return false;
  }
  if (buffered.length) await onOffset(offset + buffered.length);
  return true;
}

async function consumeFirstInlineResponseArray(response: Response, onItem: (item: unknown) => Promise<boolean>) {
  if (!response.body) throw new Error("Gemini inline batch returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const marker = /"inlinedResponses"\s*:\s*\[/;
  let search = "";
  let foundArray = false;
  let itemParts: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stopped = false;

  const consume = async (text: string) => {
    let segmentStart = depth > 0 ? 0 : -1;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (depth === 0) {
        if (char === "]") return true;
        if (char !== "{") continue;
        depth = 1;
        segmentStart = index;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
      } else if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          itemParts.push(text.slice(segmentStart, index + 1));
          if (!(await onItem(JSON.parse(itemParts.join(""))))) {
            stopped = true;
            return true;
          }
          itemParts = [];
          segmentStart = -1;
        }
      }
    }
    if (depth > 0) itemParts.push(text.slice(segmentStart));
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    const text = decoder.decode(value, { stream: !done });
    if (!foundArray) {
      search += text;
      const match = marker.exec(search);
      if (match) {
        foundArray = true;
        const complete = await consume(search.slice(match.index + match[0].length));
        search = "";
        if (complete) {
          await reader.cancel();
          return !stopped;
        }
      } else {
        search = search.slice(-64);
      }
    } else if (await consume(text)) {
      await reader.cancel();
      return !stopped;
    }
    if (done) break;
  }
  if (!foundArray) throw new Error("Gemini legacy inline batch response array was not found.");
  return true;
}

const GEMINI_INGEST_CHUNK_SIZE = 2;

async function ingestGeminiStream(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  pending: Doc<"generatedImages">[],
  consume: (onItem: (item: unknown) => Promise<boolean>) => Promise<boolean>
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
    return processed < GEMINI_INGEST_CHUNK_SIZE;
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

async function ingestBatchResults(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  pending: Doc<"generatedImages">[],
  source: BatchResultSource
): Promise<BatchIngestResult> {
  if (source.kind === "items") {
    const counts = await mapConcurrent(pending, 5, (image) => ingestBatchItem(ctx, job, image, source.results.get(image._id)));
    const total = counts.reduce((acc, count) => ({ ingested: acc.ingested + count.ingested, failed: acc.failed + count.failed }), { ingested: 0, failed: 0 });
    return { ...total, complete: true };
  }
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  if (source.kind === "gemini-file") {
    const requestedOffset = job.batchResultOffset ?? 0;
    const response = await fetch(`https://generativelanguage.googleapis.com/download/v1beta/${source.fileName}:download?alt=media`, {
      headers: {
        "x-goog-api-key": apiKey,
        ...(requestedOffset ? { Range: `bytes=${requestedOffset}-` } : {})
      }
    });
    if (!response.ok) throw new Error(`Gemini result file download failed (${response.status}).`);
    const startOffset = requestedOffset && response.status === 206 ? requestedOffset : 0;
    if (startOffset !== requestedOffset) {
      log("batch", "Gemini result file ignored range request, restarting cursor", { jobId: job._id, requestedOffset });
      await ctx.runMutation(internal.jobs.setBatchResultOffset, { jobId: job._id, offset: 0 });
    }
    return ingestGeminiStream(ctx, job, pending, (onItem) =>
      consumeJsonLines(
        response,
        startOffset,
        async (line) => onItem(JSON.parse(line)),
        async (offset) => {
          await ctx.runMutation(internal.jobs.setBatchResultOffset, { jobId: job._id, offset });
        }
      )
    );
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${source.batchName}`, {
    headers: { "x-goog-api-key": apiKey }
  });
  if (!response.ok) throw new Error(`Gemini legacy inline batch download failed (${response.status}).`);
  return ingestGeminiStream(ctx, job, pending, (onItem) => consumeFirstInlineResponseArray(response, onItem));
}

async function cleanupGeminiBatchFiles(job: Doc<"generationJobs">) {
  if (job.imageProvider !== "gemini") return;
  try {
    await deleteGeminiFile(job.batchInputFileName);
  } catch (error) {
    log("batch", "Gemini input file cleanup failed", {
      jobId: job._id,
      fileName: job.batchInputFileName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function processTerminalBatch(
  ctx: ActionCtx,
  job: Doc<"generationJobs">,
  poll: Exclude<BatchPollResult, { state: "pending" }>
): Promise<TerminalBatchResult> {
  if (poll.batchStatus !== undefined) {
    await ctx.runMutation(internal.jobs.setBatchStatus, { jobId: job._id, batchStatus: poll.batchStatus });
  }
  const acquired = await ctx.runMutation(internal.jobs.acquireBatchIngestion, { jobId: job._id });
  if (!acquired) return { state: "busy" as const };
  try {
    const images = (await ctx.runQuery(internal.jobs.imagesForJob, { jobId: job._id })) as Doc<"generatedImages">[];
    const pending = images.filter((image) => image.status === "queued" || image.status === "generating");
    if (poll.state === "cancelled") {
      log("batch", "batch cancelled", { jobId: job._id, batchId: job.batchId, pending: pending.length });
      await ctx.runMutation(internal.jobs.cancelInternal, {
        jobId: job._id,
        reason: "Provider batch was cancelled.",
        batchStatus: poll.batchStatus ?? job.batchStatus ?? null
      });
      await cleanupGeminiBatchFiles(job);
      return { state: "cancelled" as const };
    }
    if (poll.state === "failed") {
      log("batch", "batch failed", { jobId: job._id, batchId: job.batchId, error: poll.error, pending: pending.length });
      for (const image of pending) {
        await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: poll.error });
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

    log("batch", "ingesting", { jobId: job._id, batchId: job.batchId, source: poll.source.kind, pending: pending.length });
    const { ingested, failed, complete } = await ingestBatchResults(ctx, job, pending, poll.source);
    if (!complete) {
      log("batch", "chunk done", { jobId: job._id, ingested, failed });
      return { state: "partial" as const, ingested, failed };
    }
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
    await cleanupGeminiBatchFiles(job);
    log("batch", "job done", { jobId: job._id, ingested, failed });
    return { state: "done" as const, ingested, failed };
  } finally {
    await ctx.runMutation(internal.jobs.releaseBatchIngestion, { jobId: job._id });
  }
}

export const pollBatches = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = (await ctx.runQuery(internal.jobs.pendingBatchJobs, {})) as Doc<"generationJobs">[];
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    if (jobs.length) log("batch", "polling", { jobs: jobs.length });
    const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    for (const job of jobs) {
      if (!job.batchId) {
        if (Date.now() - job.updatedAt > STUCK_THRESHOLD_MS) {
          log("batch", "stuck job detected, failing", { jobId: job._id, updatedAt: job.updatedAt });
          await ctx.runMutation(internal.jobs.failStuckJob, {
            jobId: job._id,
            error: "Batch submission timed out — action was interrupted before a batch ID was assigned."
          });
        }
        continue;
      }
      const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
      let poll: BatchPollResult;
      try {
        poll = provider === "gemini" ? await pollGeminiBatch(job.batchId, job.batchInputFileName) : await pollOpenAiBatch(job.batchId, settings);
      } catch (error) {
        // Transient poll/network error — leave the job pending and retry next tick.
        log("batch", "poll error (will retry)", { jobId: job._id, batchId: job.batchId, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (poll.batchStatus !== undefined) {
        await ctx.runMutation(internal.jobs.setBatchStatus, { jobId: job._id, batchStatus: poll.batchStatus });
      }
      if (poll.state === "pending") continue;
      await processTerminalBatch(ctx, job, poll);
    }
  }
});

export const pollJob = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<ManualPollResult> => {
    await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
    if (!job) throw new Error("Job not found.");
    if (job.executionMode !== "batch") throw new Error("Job is not a batch job.");
    if (job.status !== "running") throw new Error("Job is not running.");
    if (!job.batchId) throw new Error("Job has no batch ID yet.");
    const batchId = job.batchId;
    if (!batchId) throw new Error("Job has no batch ID yet.");
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
    let poll: BatchPollResult;
    try {
      poll = provider === "gemini" ? await pollGeminiBatch(batchId, job.batchInputFileName) : await pollOpenAiBatch(batchId, settings);
    } catch (error) {
      throw new Error(`Poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    log("batch", "manual poll", { jobId: job._id, batchId, state: poll.state, batchStatus: poll.batchStatus });
    if (poll.batchStatus !== undefined) {
      await ctx.runMutation(internal.jobs.setBatchStatus, { jobId: job._id, batchStatus: poll.batchStatus });
    }
    if (poll.state === "pending") return { state: "pending", batchStatus: poll.batchStatus };
    return processTerminalBatch(ctx, job, poll);
  }
});

export const cancelJob = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<{ state: "cancelled"; batchStatus?: string | null }> => {
    await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
    if (!job) throw new Error("Job not found.");
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Job is already ${job.status}.`);
    }

    let batchStatus = job.batchStatus ?? null;
    if (job.executionMode === "batch" && job.batchId) {
      const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
      const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
      const poll = provider === "gemini" ? await pollGeminiBatch(job.batchId, job.batchInputFileName) : await pollOpenAiBatch(job.batchId, settings);
      if (poll.batchStatus !== undefined) {
        batchStatus = poll.batchStatus ?? null;
        await ctx.runMutation(internal.jobs.setBatchStatus, { jobId: job._id, batchStatus });
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
        throw new Error(`Batch cannot be cancelled in provider status ${batchStatus}.`);
      }
      batchStatus = provider === "gemini" ? await cancelGeminiBatch(job.batchId) : await cancelOpenAiBatch(job.batchId);
      await ctx.runMutation(internal.jobs.setBatchStatus, { jobId: job._id, batchStatus });
    }

    await ctx.runMutation(internal.jobs.cancelInternal, {
      jobId: args.jobId,
      reason: "Job cancelled by user.",
      batchStatus
    });
    log("batch", "job cancelled", { jobId: args.jobId, batchId: job.batchId, batchStatus });
    return { state: "cancelled", batchStatus };
  }
});

export const processJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
    if (!job || job.status === "cancelled") return;
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const vibeEnabled = job?.vibeAnalysis ?? String(settings.VIBE_ANALYSIS ?? "on") !== "off";
    const maxRetries = intEnv("MAX_RETRIES", 2);
    log("realtime", "job start", { jobId: args.jobId, provider: job?.imageProvider, model: job?.imageModel, tasks: job?.totalTasks });

    let done = 0;
    let failed = 0;
    while (true) {
      const image = (await ctx.runQuery(internal.jobs.nextQueuedImage, { jobId: args.jobId })) as Doc<"generatedImages"> | null;
      if (!image) break;

      const imageProvider = image.imageProvider === "gemini" ? "gemini" : "openai";
      const rpm =
        imageProvider === "gemini"
          ? Math.max(1, Number(settings.GEMINI_IMAGE_REQUESTS_PER_MINUTE ?? intEnv("GEMINI_IMAGE_REQUESTS_PER_MINUTE", 5)))
          : Math.max(1, Number(settings.OPENAI_IMAGE_REQUESTS_PER_MINUTE ?? intEnv("OPENAI_IMAGE_REQUESTS_PER_MINUTE", 5)));
      const minimumIntervalMs = Math.ceil(60_000 / rpm);
      await ctx.runMutation(internal.jobs.markImageGenerating, { imageId: image._id });
      try {
        if (!image.sourceImageUrl) throw new Error("Product has no Shopify supplier image to use as reference.");
        const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
        if (!product) throw new Error("Product not found.");
        log("realtime", "generating", { handle: product.handle, type: image.imageType, provider: imageProvider, model: image.imageModel });
        const vibe = await ensureProductVibe(ctx, product, image.sourceImageUrl, settings, vibeEnabled);
        const prompt = augmentPrompt(image.promptUsed, { vibe, hasSecondReference: Boolean(image.sourceImageUrl2) });
        let result: GeneratedImage | null = null;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            result =
              imageProvider === "gemini"
                ? await generateWithGemini({
                    prompt,
                    sourceImageUrl: image.sourceImageUrl,
                    sourceImageUrl2: image.sourceImageUrl2,
                    model: image.imageModel,
                    settings
                  })
                : await generateWithOpenAi({
                    prompt,
                    sourceImageUrl: image.sourceImageUrl,
                    sourceImageUrl2: image.sourceImageUrl2,
                    model: image.imageModel,
                    settings
                  });
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = /rate limit|try again|429/i.test(message) && attempt < maxRetries;
            if (!canRetry) throw error;
            await sleep(waitFromRateLimitMessage(message, minimumIntervalMs));
          }
        }
        if (!result) throw new Error("Image generation failed.");
        const optimized = await optimizeForStorage(result.bytes, result.contentType, result.extension);
        const safeHandle = product.handle.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
        const filename = buildSeoImageFilename({
          title: product.title,
          imageType: image.imageType,
          extension: optimized.extension
        });
        const key = `generated/${safeHandle}/${Date.now().toString(36)}/${filename}`;
        const storageUrl = await uploadToR2({ bytes: optimized.bytes, key, contentType: optimized.contentType });
        const costUsd = estimateCostUsd(image.imageModel ?? "", result.usage);
        await ctx.runMutation(internal.jobs.completeImage, {
          imageId: image._id,
          generatedImageUrl: storageUrl,
          storageUrl,
          providerRequestId: result.providerRequestId,
          providerResponseId: result.providerResponseId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd,
          costRateMultiplier: 1
        });
        done += 1;
        log("realtime", "stored", { handle: product.handle, type: image.imageType, file: filename, kb: Math.round(optimized.bytes.length / 1024), costUsd });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed += 1;
        log("realtime", "failed", { type: image.imageType, error: message });
        const providerIds = error instanceof ProviderGenerationError ? error.providerIds : {};
        await ctx.runMutation(internal.jobs.failImage, {
          imageId: image._id,
          error: message,
          providerRequestId: providerIds.providerRequestId,
          providerResponseId: providerIds.providerResponseId
        });
      }
      await sleep(minimumIntervalMs);
    }

    log("realtime", "job done", { jobId: args.jobId, done, failed });
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
  }
});
