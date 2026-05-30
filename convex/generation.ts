"use node";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import sharp from "sharp";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { augmentPrompt, buildSeoImageFilename } from "./lib";
import { estimateCostUsd, type TokenUsage } from "./pricing";

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

async function normalizeReferenceImage(sourceUrl: string) {
  const response = await fetch(sourceUrl);
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

type GeneratedImage = { bytes: Buffer; contentType: string; extension: string; usage: TokenUsage };

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
    throw new Error(`OpenAI image generation failed (${response.status}): ${payload?.error?.message ?? "Unknown error."}`);
  }

  const usage = openAiUsage(payload?.usage);
  const image = payload?.data?.[0];
  if (image?.b64_json) return { bytes: Buffer.from(image.b64_json, "base64"), ...mime, usage };
  if (image?.url) {
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`OpenAI returned a URL, but image download failed with ${download.status}.`);
    return { bytes: Buffer.from(await download.arrayBuffer()), ...mime, usage };
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
    throw new Error(`Gemini image generation failed (${response.status}): ${payload?.error?.message ?? "Unknown error."}`);
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
    usage: geminiUsage(payload?.usageMetadata)
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
// NOTE: the provider request/response shapes below follow the official Batch
// API docs but have not been exercised against the live APIs yet — verify the
// Gemini inline-response nesting and OpenAI input_reference handling on a real
// run before relying on this in production.

type BatchImage = Doc<"generatedImages">;
type BatchItem = { bytes?: Buffer; contentType?: string; error?: string; usage?: TokenUsage };
type BatchPollResult =
  | { state: "pending" }
  | { state: "done"; results: Map<string, BatchItem> }
  | { state: "failed"; error: string };

async function submitGeminiBatch(args: { images: BatchImage[]; settings: Record<string, unknown>; model: string }) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when Nano Banana Pro is selected.");
  const generationConfig = buildGeminiGenerationConfig(args.settings);
  const requests = await Promise.all(
    args.images.map(async (image) => {
      if (!image.sourceImageUrl) throw new Error("Product has no Shopify supplier image to use as reference.");
      const referenceParts = await buildGeminiReferenceParts([image.sourceImageUrl, image.sourceImageUrl2]);
      return {
        request: {
          contents: [{ role: "user", parts: [{ text: image.promptUsed }, ...referenceParts] }],
          generationConfig
        },
        metadata: { key: image._id }
      };
    })
  );
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:batchGenerateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        batch: { display_name: `imagen-${Date.now()}`, input_config: { requests: { requests } } }
      })
    }
  );
  const payload = (await response.json().catch(() => null)) as { name?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.name) {
    throw new Error(`Gemini batch submission failed (${response.status}): ${payload?.error?.message ?? "no batch name returned."}`);
  }
  return payload.name; // e.g. "batches/123456789"
}

async function pollGeminiBatch(batchName: string): Promise<BatchPollResult> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}`, {
    headers: { "x-goog-api-key": apiKey }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    return { state: "failed", error: `Gemini batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}` };
  }
  // Gemini reports the terminal state as BATCH_STATE_* (older docs/builds used
  // JOB_STATE_*), so match on the suffix to stay robust to either prefix.
  const state: string = payload?.metadata?.state ?? payload?.state ?? "";
  if (/_(FAILED|EXPIRED|CANCELLED)$/.test(state)) {
    return { state: "failed", error: `Gemini batch ${state}.` };
  }
  if (!/_SUCCEEDED$/.test(state)) return { state: "pending" };

  // Results live under metadata.output.inlinedResponses on a succeeded batch,
  // with response.inlinedResponses as a fallback for other response shapes.
  const inlined: unknown[] =
    payload?.metadata?.output?.inlinedResponses?.inlinedResponses ??
    payload?.response?.inlinedResponses?.inlinedResponses ??
    payload?.response?.inlined_responses ??
    [];
  const results = new Map<string, BatchItem>();
  inlined.forEach((raw, index) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = raw as any;
    const key: string = item?.metadata?.key ?? item?.key ?? String(index);
    if (item?.error) {
      results.set(key, { error: item.error.message ?? "Gemini batch item failed." });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = item?.response?.candidates?.[0]?.content?.parts ?? [];
    const data = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const base64 = data?.inlineData?.data ?? data?.inline_data?.data;
    if (!base64) {
      results.set(key, { error: "Gemini batch returned no image data." });
      return;
    }
    const contentType = data?.inlineData?.mimeType ?? data?.inline_data?.mime_type ?? "image/png";
    results.set(key, { bytes: Buffer.from(base64, "base64"), contentType, usage: geminiUsage(item?.response?.usageMetadata) });
  });
  return { state: "done", results };
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
  const lines: string[] = [];
  for (const image of args.images) {
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
    lines.push(
      JSON.stringify({
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
      })
    );
  }

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
  const batchPayload = (await batchResponse.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!batchResponse.ok || !batchPayload?.id) {
    throw new Error(`OpenAI batch creation failed (${batchResponse.status}): ${batchPayload?.error?.message ?? "no batch id."}`);
  }
  return batchPayload.id;
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
    return { state: "failed", error: `OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}` };
  }
  const status: string = payload?.status ?? "";
  if (status === "failed" || status === "expired" || status === "cancelled") {
    // Surface the batch-level errors (e.g. unsupported model) instead of a
    // generic status, so the cause is visible directly in the logs.
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload?.errors?.data ?? []).map((entry: any) => entry?.message).filter(Boolean).join("; ") ||
      payload?.error?.message ||
      "";
    return { state: "failed", error: `OpenAI batch ${status}${detail ? `: ${detail}` : "."}` };
  }
  if (status !== "completed") return { state: "pending" };

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
          error: parsed?.error?.message ?? parsed?.response?.body?.error?.message ?? "OpenAI batch item failed."
        });
        continue;
      }
      const b64 = parsed?.response?.body?.data?.[0]?.b64_json;
      if (!b64) {
        results.set(key, { error: "OpenAI batch returned no image data." });
        continue;
      }
      results.set(key, { bytes: Buffer.from(b64, "base64"), ...mime, usage: openAiUsage(parsed?.response?.body?.usage) });
    }
  };
  await ingest(payload?.output_file_id);
  await ingest(payload?.error_file_id);
  return { state: "done", results };
}

export const submitBatch = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const images = (await ctx.runQuery(internal.jobs.imagesForJob, { jobId: args.jobId })) as Doc<"generatedImages">[];
    if (!images.length) {
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
      return;
    }
    const provider = images[0].imageProvider === "gemini" ? "gemini" : "openai";
    const model = images[0].imageModel ?? (provider === "gemini" ? "gemini-3-pro-image-preview" : "gpt-image-2-2026-04-21");

    // Vibe analysis once per distinct product, then bake the scene context and
    // second-image guidance into each prompt before the batch is submitted.
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
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
      const batchId =
        provider === "gemini"
          ? await submitGeminiBatch({ images: preparedImages, settings, model })
          : await submitOpenAiBatch({ images: preparedImages, settings, model });
      await ctx.runMutation(internal.jobs.setBatchId, { jobId: args.jobId, batchId });
      await ctx.runMutation(internal.jobs.markImagesGenerating, { jobId: args.jobId });
      log("batch", "submitted", { jobId: args.jobId, batchId, count: images.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("batch", "submit failed", { jobId: args.jobId, error: message });
      for (const image of images) {
        await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: message });
      }
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
    }
  }
});

export const pollBatches = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = (await ctx.runQuery(internal.jobs.pendingBatchJobs, {})) as Doc<"generationJobs">[];
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    if (jobs.length) log("batch", "polling", { jobs: jobs.length });
    for (const job of jobs) {
      if (!job.batchId) continue;
      const provider = job.imageProvider === "gemini" ? "gemini" : "openai";
      let poll: BatchPollResult;
      try {
        poll = provider === "gemini" ? await pollGeminiBatch(job.batchId) : await pollOpenAiBatch(job.batchId, settings);
      } catch (error) {
        // Transient poll/network error — leave the job pending and retry next tick.
        log("batch", "poll error (will retry)", { jobId: job._id, batchId: job.batchId, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (poll.state === "pending") continue;

      const images = (await ctx.runQuery(internal.jobs.imagesForJob, { jobId: job._id })) as Doc<"generatedImages">[];
      const pending = images.filter((image) => image.status !== "generated" && image.status !== "uploaded");

      if (poll.state === "failed") {
        log("batch", "batch failed", { jobId: job._id, batchId: job.batchId, error: poll.error, pending: pending.length });
        for (const image of pending) {
          await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: poll.error });
        }
        await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
        continue;
      }

      log("batch", "ingesting", { jobId: job._id, batchId: job.batchId, pending: pending.length });
      let ingested = 0;
      let failedCount = 0;
      for (const image of pending) {
        const result = poll.results.get(image._id);
        if (!result || result.error || !result.bytes) {
          const error = result?.error ?? "No batch result returned for this image.";
          failedCount += 1;
          log("batch", "image failed", { jobId: job._id, type: image.imageType, error });
          await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error });
          continue;
        }
        try {
          const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
          const optimized = await optimizeForStorage(
            result.bytes,
            result.contentType ?? "image/png",
            mimeToExtension(result.contentType ?? "image/png")
          );
          const safeHandle = (product?.handle ?? "product").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
          const filename = buildSeoImageFilename({
            title: product?.title ?? safeHandle,
            imageType: image.imageType,
            extension: optimized.extension
          });
          const key = `generated/${safeHandle}/${Date.now().toString(36)}/${filename}`;
          const storageUrl = await uploadToR2({ bytes: optimized.bytes, key, contentType: optimized.contentType });
          const usage = result.usage ?? {};
          const costUsd = estimateCostUsd(job.imageModel ?? "", usage);
          await ctx.runMutation(internal.jobs.completeImage, {
            imageId: image._id,
            generatedImageUrl: storageUrl,
            storageUrl,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd
          });
          ingested += 1;
          log("batch", "stored", { jobId: job._id, handle: safeHandle, type: image.imageType, file: filename, kb: Math.round(optimized.bytes.length / 1024), costUsd });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failedCount += 1;
          log("batch", "image failed", { jobId: job._id, type: image.imageType, error: message });
          await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: message });
        }
      }
      log("batch", "job done", { jobId: job._id, ingested, failed: failedCount });
      await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: job._id });
    }
  }
});

export const processJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const job = (await ctx.runQuery(internal.jobs.getJobInternal, { jobId: args.jobId })) as Doc<"generationJobs"> | null;
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
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd
        });
        done += 1;
        log("realtime", "stored", { handle: product.handle, type: image.imageType, file: filename, kb: Math.round(optimized.bytes.length / 1024), costUsd });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed += 1;
        log("realtime", "failed", { type: image.imageType, error: message });
        await ctx.runMutation(internal.jobs.failImage, { imageId: image._id, error: message });
      }
      await sleep(minimumIntervalMs);
    }

    log("realtime", "job done", { jobId: args.jobId, done, failed });
    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
  }
});
