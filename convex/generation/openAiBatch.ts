"use node";

import { openAiUsage, OUTPUT_FORMAT_TO_MIME } from "./formats";
import { normalizeReferenceImage } from "./images";
import {
  deleteKeyFromR2,
  deleteR2ObjectsWithPrefix,
  uploadToR2,
} from "./storage";
import { env, log } from "./runtime";
import { mapConcurrent } from "./concurrency";
import {
  isTransientPollStatus,
  generationInputUrlsForImage,
  type BatchItem,
  type BatchPollResult,
} from "./batchTypes";
import type { PromptKind } from "../promptRuntime";

export type OpenAiBatchImage = {
  _id: string;
  promptUsed: string;
  finalPromptUsed?: string | null;
  sourceImageUrls?: string[];
  sourceImageUrl?: string | null;
  sourceImageUrl2?: string | null;
  promptKind?: PromptKind | string | null;
  modelReferenceUrl?: string | null;
};

const OPENAI_BATCH_REFERENCE_PREFIX = "batch-references";
const OPENAI_BATCH_REFERENCE_TTL_MS = 48 * 60 * 60 * 1000;

export function openAiBatchReferenceKey(imageId: string, index: number) {
  return `${OPENAI_BATCH_REFERENCE_PREFIX}/${imageId}-${index}.jpg`;
}

export async function cleanupOpenAiBatchReferencesForImage(
  image: OpenAiBatchImage,
) {
  const referenceCount = generationInputUrlsForImage(image).length;
  if (!referenceCount) return;
  await mapConcurrent(
    Array.from({ length: referenceCount }, (_, index) => index),
    3,
    async (index) => {
      const key = openAiBatchReferenceKey(image._id, index);
      try {
        await deleteKeyFromR2(key);
      } catch (error) {
        log("batch", "OpenAI batch reference cleanup failed", {
          imageId: image._id,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export async function cleanupOpenAiBatchReferencesForImages(
  images: OpenAiBatchImage[],
) {
  await mapConcurrent(images, 3, cleanupOpenAiBatchReferencesForImage);
}

export async function cleanupStaleOpenAiBatchReferencesFromR2() {
  const result = await deleteR2ObjectsWithPrefix({
    prefix: `${OPENAI_BATCH_REFERENCE_PREFIX}/`,
    olderThanMs: OPENAI_BATCH_REFERENCE_TTL_MS,
    limit: 500,
  });
  if (result.deleted) {
    log("batch", "cleaned stale OpenAI batch references", {
      deleted: result.deleted,
    });
  }
  return result;
}

export async function submitOpenAiBatch(args: {
  images: OpenAiBatchImage[];
  settings: Record<string, unknown>;
  model: string;
}) {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const size = String(
    args.settings.OPENAI_IMAGE_SIZE ?? env("OPENAI_IMAGE_SIZE", "1024x1024"),
  );
  const quality = String(
    args.settings.OPENAI_IMAGE_QUALITY ??
      env("OPENAI_IMAGE_QUALITY", "medium"),
  );
  const outputFormat = String(
    args.settings.OPENAI_IMAGE_OUTPUT_FORMAT ??
      env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg"),
  ).toLowerCase();
  // Batch JSONL cannot carry multipart uploads, so the reference image must be
  // passed by URL. Normalize like the realtime path, stage it on R2, then send
  // it under the JSON `images` array the edits endpoint requires (each entry is
  // an object { image_url }, even for a single reference).
  const lines = await mapConcurrent(args.images, 5, async (image) => {
    const referenceUrls = generationInputUrlsForImage(image);
    if (!referenceUrls.length)
      throw new Error(
        "Product has no Shopify supplier image to use as reference.",
      );
    const staged: Array<{ image_url: string }> = [];
    for (let index = 0; index < referenceUrls.length; index += 1) {
      const referenceBytes = await normalizeReferenceImage(
        referenceUrls[index],
      );
      const referenceUrl = await uploadToR2({
        bytes: referenceBytes,
        key: openAiBatchReferenceKey(image._id, index),
        contentType: "image/jpeg",
      });
      staged.push({ image_url: referenceUrl });
    }
    return JSON.stringify({
      custom_id: image._id,
      method: "POST",
      url: "/v1/images/edits",
      body: {
        model: args.model,
        prompt: image.finalPromptUsed ?? image.promptUsed,
        n: 1,
        size,
        quality,
        output_format: outputFormat,
        images: staged,
      },
    });
  });

  const fileForm = new FormData();
  fileForm.append("purpose", "batch");
  fileForm.append(
    "file",
    new Blob([lines.join("\n")], { type: "application/jsonl" }),
    `imagen-${Date.now()}.jsonl`,
  );
  const fileResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fileForm,
  });
  const filePayload = (await fileResponse.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;
  if (!fileResponse.ok || !filePayload?.id) {
    throw new Error(
      `OpenAI batch file upload failed (${fileResponse.status}): ${filePayload?.error?.message ?? "no file id."}`,
    );
  }

  const batchResponse = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input_file_id: filePayload.id,
      endpoint: "/v1/images/edits",
      completion_window: "24h",
    }),
  });
  const batchPayload = (await batchResponse.json().catch(() => null)) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  } | null;
  if (!batchResponse.ok || !batchPayload?.id) {
    throw new Error(
      `OpenAI batch creation failed (${batchResponse.status}): ${batchPayload?.error?.message ?? "no batch id."}`,
    );
  }
  return { batchId: batchPayload.id, batchStatus: batchPayload.status ?? null };
}

export async function pollOpenAiBatch(
  batchId: string,
  settings: Record<string, unknown>,
): Promise<BatchPollResult> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    if (isTransientPollStatus(response.status)) {
      throw new Error(
        `OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
      );
    }
    return {
      state: "failed",
      error: `OpenAI batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
    };
  }
  const status: string = payload?.status ?? "";
  const batchStatus = status || null;
  if (status === "failed" || status === "expired" || status === "cancelled") {
    // Surface batch-level errors (e.g. unsupported model) instead of a
    // generic status, so the cause is visible directly in logs.
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload?.errors?.data ?? [])
        .map((entry: any) => entry?.message)
        .filter(Boolean)
        .join("; ") ||
      payload?.error?.message ||
      "";
    if (status === "cancelled") return { state: "cancelled", batchStatus };
    return {
      state: "failed",
      error: `OpenAI batch ${status}${detail ? `: ${detail}` : "."}`,
      batchStatus,
    };
  }
  if (status !== "completed") return { state: "pending", batchStatus };

  const outputFormat = String(
    settings.OPENAI_IMAGE_OUTPUT_FORMAT ??
      env("OPENAI_IMAGE_OUTPUT_FORMAT", "jpeg"),
  ).toLowerCase();
  const mime =
    OUTPUT_FORMAT_TO_MIME[outputFormat] ?? OUTPUT_FORMAT_TO_MIME.jpeg;
  const results = new Map<string, BatchItem>();

  const ingest = async (fileId: string | undefined) => {
    if (!fileId) return;
    const content = await fetch(
      `https://api.openai.com/v1/files/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
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
          error:
            parsed?.error?.message ??
            parsed?.response?.body?.error?.message ??
            "OpenAI batch item failed.",
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
        providerResponseId: parsed?.response?.body?.id ?? null,
      });
    }
  };
  await ingest(payload?.output_file_id);
  await ingest(payload?.error_file_id);
  return { state: "done", source: { kind: "items", results }, batchStatus };
}

export async function cancelOpenAiBatch(
  batchId: string,
): Promise<string | null> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const response = await fetch(
    `https://api.openai.com/v1/batches/${batchId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    status?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(
      `OpenAI batch cancel failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
    );
  }
  return payload?.status ?? "cancelling";
}
