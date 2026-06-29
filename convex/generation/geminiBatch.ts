"use node";

import { geminiUsage } from "./formats";
import type { BatchItem } from "./batchTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function geminiBatchStatus(payload: any): string | null {
  const raw =
    payload?.state ??
    payload?.metadata?.state ??
    payload?.metadata?.batchState ??
    null;
  return typeof raw === "string" && raw ? raw : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function geminiResponsesFile(payload: any): string | null {
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

export function isGeminiSucceeded(status: string | null | undefined) {
  return (
    status === "JOB_STATE_SUCCEEDED" ||
    status === "BATCH_STATE_SUCCEEDED" ||
    status === "SUCCEEDED"
  );
}

export function isGeminiFailed(status: string | null | undefined) {
  return (
    status === "JOB_STATE_FAILED" ||
    status === "BATCH_STATE_FAILED" ||
    status === "JOB_STATE_EXPIRED" ||
    status === "BATCH_STATE_EXPIRED"
  );
}

export function isGeminiCancelled(status: string | null | undefined) {
  return (
    status === "JOB_STATE_CANCELLED" ||
    status === "BATCH_STATE_CANCELLED" ||
    status === "CANCELLED" ||
    status === "CANCELED"
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function geminiBatchItem(raw: any): { key?: string; result: BatchItem } {
  const key: string | undefined = raw?.metadata?.key ?? raw?.key;
  const providerRequestId =
    raw?.id ?? raw?.metadata?.requestId ?? raw?.metadata?.request_id ?? null;
  const providerResponseId =
    raw?.response?.id ??
    raw?.response?.responseId ??
    raw?.response?.response_id ??
    null;
  if (raw?.error)
    return {
      key,
      result: {
        error: raw.error.message ?? "Gemini batch item failed.",
        providerRequestId,
        providerResponseId,
      },
    };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = raw?.response?.candidates?.[0]?.content?.parts ?? [];
  const data = parts.find(
    (part) => part?.inlineData?.data || part?.inline_data?.data,
  );
  const base64 = data?.inlineData?.data ?? data?.inline_data?.data;
  if (!base64)
    return {
      key,
      result: {
        error: "Gemini batch returned no image data.",
        providerRequestId,
        providerResponseId,
      },
    };
  const contentType =
    data?.inlineData?.mimeType ?? data?.inline_data?.mime_type ?? "image/png";
  return {
    key,
    result: {
      bytes: Buffer.from(base64, "base64"),
      contentType,
      usage: geminiUsage(raw?.response?.usageMetadata),
      providerRequestId,
      providerResponseId,
    },
  };
}
