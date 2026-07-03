"use node";

import { ProviderGenerationError } from "./errors";
import { geminiUsage, mimeToExtension } from "./formats";
import { normalizeReferenceImage } from "./images";
import {
  providerIdsFromResponse,
} from "./providerIds";
import { env } from "./runtime";
import type { GeneratedImage } from "./types";

export type GeminiGeneratedImage = GeneratedImage;

// Shared by the real-time and batch Gemini paths. Gemini only honours an
// imageConfig block when at least one field is set, so omit empty fields.
export function buildGeminiGenerationConfig(settings: Record<string, unknown>) {
  const aspectRatio = String(
    settings.GEMINI_IMAGE_ASPECT_RATIO ?? env("GEMINI_IMAGE_ASPECT_RATIO", ""),
  ).trim();
  const imageSize = String(
    settings.GEMINI_IMAGE_SIZE ?? env("GEMINI_IMAGE_SIZE", ""),
  ).trim();
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
  };
  const imageConfig: Record<string, string> = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (imageSize) imageConfig.imageSize = imageSize;
  if (Object.keys(imageConfig).length > 0)
    generationConfig.imageConfig = imageConfig;
  return generationConfig;
}

// Normalizes a provided reference URL into a Gemini inline_data image part.
// Skips empty entries so callers can pass [primary, secondary] freely.
export async function buildGeminiReferenceParts(
  urls: Array<string | null | undefined>,
  referenceImageCache?: Map<string, Promise<Buffer>>,
) {
  const parts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  for (const url of urls) {
    if (!url) continue;
    const bytes = referenceImageCache
      ? await getCachedReferenceImage(referenceImageCache, url)
      : await normalizeReferenceImage(url);
    parts.push({
      inline_data: { mime_type: "image/jpeg", data: bytes.toString("base64") },
    });
  }
  return parts;
}

function getCachedReferenceImage(
  cache: Map<string, Promise<Buffer>>,
  url: string,
) {
  let cached = cache.get(url);
  if (!cached) {
    cached = normalizeReferenceImage(url);
    cache.set(url, cached);
  }
  return cached;
}

export async function generateWithGemini(args: {
  prompt: string;
  sourceImageUrl: string;
  sourceImageUrl2?: string | null;
  sourceImageUrls?: string[];
  model?: string;
  settings: Record<string, unknown>;
}): Promise<GeminiGeneratedImage> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey)
    throw new Error(
      "GEMINI_API_KEY is required when Nano Banana Pro is selected.",
    );
  const model =
    args.model ??
    String(
      args.settings.GEMINI_IMAGE_MODEL ??
        env("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview"),
    );
  const referenceParts = await buildGeminiReferenceParts(
    args.sourceImageUrls?.length
      ? args.sourceImageUrls
      : [args.sourceImageUrl, args.sourceImageUrl2],
  );
  const generationConfig = buildGeminiGenerationConfig(args.settings);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: args.prompt }, ...referenceParts],
          },
        ],
        generationConfig,
      }),
    },
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
      providerIdsFromResponse(response, payload),
    );
  }

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const data = parts.find(
    (part) => part.inlineData?.data || part.inline_data?.data,
  );
  const base64 = data?.inlineData?.data ?? data?.inline_data?.data;
  if (!base64)
    throw new Error("Gemini image generation returned no image data.");
  // Preserve Gemini's native bytes (PNG by default) instead of re-encoding to JPEG.
  const contentType =
    data?.inlineData?.mimeType ?? data?.inline_data?.mime_type ?? "image/png";
  return {
    bytes: Buffer.from(base64, "base64"),
    contentType,
    extension: mimeToExtension(contentType),
    usage: geminiUsage(payload?.usageMetadata),
    ...providerIdsFromResponse(response, payload),
  };
}
