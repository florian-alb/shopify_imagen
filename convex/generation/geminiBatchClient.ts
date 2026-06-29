"use node";

import type { Doc } from "../_generated/dataModel";
import { env } from "./runtime";
import { mapConcurrent } from "./concurrency";
import {
  isTransientPollStatus,
  referenceUrlsForImage,
  type BatchPollResult,
} from "./batchTypes";
import {
  buildGeminiGenerationConfig,
  buildGeminiReferenceParts,
} from "./gemini";
import {
  geminiBatchStatus,
  geminiResponsesFile,
  isGeminiCancelled,
  isGeminiFailed,
  isGeminiSucceeded,
} from "./geminiBatch";

type BatchImage = Doc<"generatedImages">;

export async function uploadGeminiFile(args: {
  apiKey: string;
  body: string;
  displayName: string;
}) {
  const bytes = Buffer.from(args.body);
  const start = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": args.apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      },
      body: JSON.stringify({ file: { display_name: args.displayName } }),
    },
  );
  if (!start.ok) {
    const payload = (await start.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      `Gemini batch file upload start failed (${start.status}): ${payload?.error?.message ?? "unknown error."}`,
    );
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl)
    throw new Error("Gemini batch file upload start returned no upload URL.");

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/jsonl",
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const payload = (await upload.json().catch(() => null)) as {
    file?: { name?: string };
    error?: { message?: string };
  } | null;
  if (!upload.ok || !payload?.file?.name) {
    throw new Error(
      `Gemini batch file upload failed (${upload.status}): ${payload?.error?.message ?? "no file name returned."}`,
    );
  }
  return payload.file.name;
}

export async function deleteGeminiFile(fileName: string | null | undefined) {
  if (!fileName) return;
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
    {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Gemini file cleanup failed (${response.status}) for ${fileName}.`,
    );
  }
}

export async function submitGeminiBatch(args: {
  images: BatchImage[];
  settings: Record<string, unknown>;
  model: string;
}) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey)
    throw new Error(
      "GEMINI_API_KEY is required when Nano Banana Pro is selected.",
    );
  const generationConfig = buildGeminiGenerationConfig(args.settings);
  const lines = await mapConcurrent(args.images, 5, async (image) => {
    const referenceUrls = referenceUrlsForImage(image);
    if (!referenceUrls.length)
      throw new Error(
        "Product has no Shopify supplier image to use as reference.",
      );
    const referenceParts = await buildGeminiReferenceParts(referenceUrls);
    return JSON.stringify({
      key: image._id,
      request: {
        contents: [
          {
            role: "user",
            parts: [
              { text: image.finalPromptUsed ?? image.promptUsed },
              ...referenceParts,
            ],
          },
        ],
        generationConfig,
      },
    });
  });
  const displayName = `imagen-${Date.now()}`;
  const inputFileName = await uploadGeminiFile({
    apiKey,
    body: lines.join("\n"),
    displayName,
  });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:batchGenerateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        batch: {
          display_name: displayName,
          input_config: { file_name: inputFileName },
        },
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    name?: string;
    state?: string;
    metadata?: { state?: string };
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.name) {
    await deleteGeminiFile(inputFileName).catch(() => undefined);
    throw new Error(
      `Gemini batch submission failed (${response.status}): ${payload?.error?.message ?? "no batch name returned."}`,
    );
  }
  return {
    batchId: payload.name,
    inputFileName,
    batchStatus: geminiBatchStatus(payload),
  }; // e.g. "batches/123456789"
}

export async function pollGeminiBatch(
  batchName: string,
  inputFileName?: string | null,
): Promise<BatchPollResult> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  const batchUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
  const response = await fetch(`${batchUrl}?fields=name,metadata,done,error`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const payload = (await response.json().catch(() => null)) as {
    done?: boolean;
    metadata?: {
      state?: string;
      batchState?: string;
      output?: { responsesFile?: string; responses_file?: string };
    };
    error?: { message?: string };
  } | null;
  const batchStatus = geminiBatchStatus(payload);
  if (!response.ok) {
    if (isTransientPollStatus(response.status)) {
      throw new Error(
        `Gemini batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
      );
    }
    return {
      state: "failed",
      error: `Gemini batch poll failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
      batchStatus,
    };
  }
  if (isGeminiCancelled(batchStatus))
    return { state: "cancelled", batchStatus };
  if (payload?.error)
    return {
      state: "failed",
      error: `Gemini batch failed: ${payload.error.message ?? "unknown error."}`,
      batchStatus,
    };
  if (isGeminiFailed(batchStatus))
    return {
      state: "failed",
      error: `Gemini batch ${batchStatus}.`,
      batchStatus,
    };
  if (!payload?.done && !isGeminiSucceeded(batchStatus))
    return { state: "pending", batchStatus };

  // New jobs are submitted through File API and return a small JSONL result
  // file. Jobs submitted by older app versions used inline responses; preserve
  // a streaming recovery path for them without loading the operation JSON.
  if (!inputFileName)
    return {
      state: "done",
      source: { kind: "gemini-inline", batchName },
      batchStatus,
    };
  const metadataFileName = geminiResponsesFile(payload);
  if (metadataFileName)
    return {
      state: "done",
      source: { kind: "gemini-file", fileName: metadataFileName },
      batchStatus,
    };
  const details = await fetch(`${batchUrl}?fields=response,error`, {
    headers: { "x-goog-api-key": apiKey },
  });
  const detailsPayload = (await details.json().catch(() => null)) as {
    response?: { responsesFile?: string; responses_file?: string };
    error?: { message?: string };
  } | null;
  if (!details.ok) {
    if (isTransientPollStatus(details.status)) {
      throw new Error(
        `Gemini batch result lookup failed (${details.status}): ${detailsPayload?.error?.message ?? "unknown error."}`,
      );
    }
    return {
      state: "failed",
      error: `Gemini batch result lookup failed (${details.status}): ${detailsPayload?.error?.message ?? "unknown error."}`,
      batchStatus,
    };
  }
  if (detailsPayload?.error)
    return {
      state: "failed",
      error: `Gemini batch result lookup failed (${details.status}): ${detailsPayload.error.message ?? "unknown error."}`,
      batchStatus,
    };
  const fileName = geminiResponsesFile(detailsPayload);
  if (!fileName)
    return {
      state: "failed",
      error: "Gemini batch completed without a response file.",
      batchStatus,
    };
  return {
    state: "done",
    source: { kind: "gemini-file", fileName },
    batchStatus,
  };
}

export async function cancelGeminiBatch(batchName: string): Promise<string | null> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${batchName}:cancel`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    state?: string;
    metadata?: { state?: string };
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(
      `Gemini batch cancel failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
    );
  }
  return geminiBatchStatus(payload) ?? "JOB_STATE_CANCELLED";
}
