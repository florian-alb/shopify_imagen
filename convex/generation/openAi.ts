"use node";

import { ProviderGenerationError } from "./errors";
import { openAiUsage, OUTPUT_FORMAT_TO_MIME } from "./formats";
import { normalizeReferenceImage } from "./images";
import {
  providerIdsFromResponse,
} from "./providerIds";
import { env } from "./runtime";
import type { GeneratedImage } from "./types";

export type OpenAiGeneratedImage = GeneratedImage;

export async function generateWithOpenAi(args: {
  prompt: string;
  sourceImageUrl: string;
  sourceImageUrl2?: string | null;
  sourceImageUrls?: string[];
  model?: string;
  settings: Record<string, unknown>;
}): Promise<OpenAiGeneratedImage> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const referenceUrls = args.sourceImageUrls?.length
    ? args.sourceImageUrls
    : [args.sourceImageUrl, args.sourceImageUrl2].filter((url): url is string =>
        Boolean(url),
      );
  const outputFormat = String(
    args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ??
      env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg"),
  ).toLowerCase();
  const mime =
    OUTPUT_FORMAT_TO_MIME[outputFormat] ?? OUTPUT_FORMAT_TO_MIME.jpeg;
  const form = new FormData();
  form.append(
    "model",
    args.model ??
      String(
        args.settings.OPENAI_IMAGE_MODEL ??
          env("OPENAI_IMAGE_MODEL", "gpt-image-2-2026-04-21"),
      ),
  );
  form.append("prompt", args.prompt);
  form.append("n", "1");
  form.append(
    "size",
    String(
      args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024"),
    ),
  );
  form.append(
    "quality",
    String(
      args.settings.OPENAI_IMAGE_QUALITY ??
        env("OPENAI_IMAGE_QUALITY", "medium"),
    ),
  );
  form.append("output_format", outputFormat);
  // gpt-image edits accept multiple reference images via repeated image[] parts;
  // a single reference keeps the original "image" field name.
  const imageField = referenceUrls.length > 1 ? "image[]" : "image";
  for (let index = 0; index < referenceUrls.length; index += 1) {
    const referenceBytes = await normalizeReferenceImage(referenceUrls[index]);
    form.append(
      imageField,
      new Blob([new Uint8Array(referenceBytes)], { type: "image/jpeg" }),
      `reference-${index}.jpg`,
    );
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
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
      providerIdsFromResponse(response, payload),
    );
  }

  const usage = openAiUsage(payload?.usage);
  const image = payload?.data?.[0];
  const providerIds = providerIdsFromResponse(response, payload);
  if (image?.b64_json)
    return {
      bytes: Buffer.from(image.b64_json, "base64"),
      ...mime,
      usage,
      ...providerIds,
    };
  if (image?.url) {
    const download = await fetch(image.url);
    if (!download.ok)
      throw new Error(
        `OpenAI returned a URL, but image download failed with ${download.status}.`,
      );
    return {
      bytes: Buffer.from(await download.arrayBuffer()),
      ...mime,
      usage,
      ...providerIds,
    };
  }
  throw new Error("OpenAI image generation returned no image data.");
}
