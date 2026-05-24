import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { waitAfterRateLimit, waitForImageRequestSlot } from "./rateLimit.js";
import type { ImageType, ShopifyProduct } from "../types.js";

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function writeImageFromUrl(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAI returned an image URL, but download failed with ${response.status}.`);
  }

  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function callOpenAiImageEdit(form: FormData): Promise<Response> {
  await waitForImageRequestSlot();
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: form
  });
}

type ImageGenerationPayload = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; type?: string; code?: string };
} | null;

async function writeGeneratedImage(payload: ImageGenerationPayload, outputPath: string): Promise<string> {
  const image = payload?.data?.[0];
  if (!image) {
    throw new Error("OpenAI image generation returned no image data.");
  }

  if (image.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(image.b64_json, "base64"));
    return outputPath;
  }

  if (image.url) {
    await writeImageFromUrl(image.url, outputPath);
    return outputPath;
  }

  throw new Error("OpenAI image generation returned neither b64_json nor url.");
}

export async function generateImageWithOpenAi(args: {
  product: ShopifyProduct;
  imageType: ImageType;
  prompt: string;
  outputPath: string;
  referenceImagePath: string;
}): Promise<string> {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for API image generation.");
  }

  const referenceBytes = fs.readFileSync(args.referenceImagePath);
  const form = new FormData();

  form.append("model", config.openaiImageModel);
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append("size", config.openaiImageSize);
  form.append("quality", config.openaiImageQuality);
  form.append("output_format", config.openaiImageOutputFormat);
  const imageBlob = new Blob([new Uint8Array(referenceBytes)], {
    type: mimeTypeForPath(args.referenceImagePath)
  });
  form.append("image", imageBlob, path.basename(args.referenceImagePath));

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const response = await callOpenAiImageEdit(form);
    const payload = (await response.json().catch(() => null)) as ImageGenerationPayload;

    if (response.ok) {
      return writeGeneratedImage(payload, args.outputPath);
    }

    const message = payload?.error?.message ?? `OpenAI image generation failed with ${response.status}.`;
    if (response.status === 429 && attempt < config.maxRetries && await waitAfterRateLimit(message)) {
      continue;
    }

    throw new Error(message);
  }
  throw new Error("OpenAI image generation failed.");
}
