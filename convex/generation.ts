"use node";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import { Jimp } from "jimp";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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

function waitFromRateLimitMessage(message: string, minimumMs: number) {
  const match = message.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) + 1250 : minimumMs;
}

async function normalizeReferenceImage(sourceUrl: string) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to download supplier reference image (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const image = await Jimp.read(bytes);

  if (image.width > 1024 || image.height > 1024) {
    image.scaleToFit({ w: 1024, h: 1024 });
  }

  const opaqueImage = new Jimp({
    width: image.width,
    height: image.height,
    color: 0xffffffff
  }).composite(image, 0, 0);

  return opaqueImage.getBuffer("image/jpeg", { quality: 92 });
}

async function generateWithOpenAi(args: {
  prompt: string;
  sourceImageUrl: string;
  settings: Record<string, unknown>;
}) {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const referenceBytes = await normalizeReferenceImage(args.sourceImageUrl);
  const form = new FormData();
  form.append("model", String(args.settings.OPENAI_IMAGE_MODEL ?? env("OPENAI_IMAGE_MODEL", "gpt-image-2-2026-04-21")));
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append("size", String(args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024")));
  form.append("quality", String(args.settings.OPENAI_IMAGE_QUALITY ?? env("OPENAI_IMAGE_QUALITY", "medium")));
  form.append("output_format", String(args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ?? env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg")));
  form.append("image", new Blob([new Uint8Array(referenceBytes)], { type: "image/jpeg" }), "supplier-reference.jpg");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `OpenAI image generation failed with ${response.status}.`);
  }

  const image = payload?.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const download = await fetch(image.url);
    if (!download.ok) throw new Error(`OpenAI returned a URL, but image download failed with ${download.status}.`);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("OpenAI image generation returned no image data.");
}

async function uploadToR2(args: { bytes: Buffer; key: string }) {
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
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return `${publicBaseUrl}/${args.key}`;
}

export const processJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
    const settings = (await ctx.runQuery(internal.settings.internalList, {})) as Record<string, unknown>;
    const rpm = Math.max(1, Number(settings.OPENAI_IMAGE_REQUESTS_PER_MINUTE ?? intEnv("OPENAI_IMAGE_REQUESTS_PER_MINUTE", 5)));
    const minimumIntervalMs = Math.ceil(60_000 / rpm);
    const maxRetries = intEnv("MAX_RETRIES", 2);

    while (true) {
      const image = (await ctx.runQuery(internal.jobs.nextQueuedImage, { jobId: args.jobId })) as Doc<"generatedImages"> | null;
      if (!image) break;

      await ctx.runMutation(internal.jobs.markImageGenerating, { imageId: image._id });
      try {
        if (!image.sourceImageUrl) throw new Error("Product has no Shopify supplier image to use as reference.");
        const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
        if (!product) throw new Error("Product not found.");
        let bytes: Buffer | null = null;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            bytes = await generateWithOpenAi({
              prompt: image.promptUsed,
              sourceImageUrl: image.sourceImageUrl,
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
        if (!bytes) throw new Error("Image generation failed.");
        const safeHandle = product.handle.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
        const key = `generated/${safeHandle}/${Date.now()}-${image.imageType}.jpg`;
        const storageUrl = await uploadToR2({ bytes, key });
        await ctx.runMutation(internal.jobs.completeImage, {
          imageId: image._id,
          generatedImageUrl: storageUrl,
          storageUrl
        });
      } catch (error) {
        await ctx.runMutation(internal.jobs.failImage, {
          imageId: image._id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await sleep(minimumIntervalMs);
    }

    await ctx.runMutation(internal.jobs.finishJobIfDone, { jobId: args.jobId });
  }
});
