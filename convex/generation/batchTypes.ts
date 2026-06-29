import type { TokenUsage } from "../pricing";
import type { ProviderIds } from "./providerIds";

export type BatchItem = {
  bytes?: Buffer;
  contentType?: string;
  error?: string;
  usage?: TokenUsage;
} & ProviderIds;

export type BatchIngestCounts = { ingested: number; failed: number };
export type BatchIngestResult = BatchIngestCounts & { complete: boolean };

export type BatchResultSource =
  | { kind: "items"; results: Map<string, BatchItem> }
  | { kind: "gemini-file"; fileName: string }
  | { kind: "gemini-inline"; batchName: string };

export type BatchPollResult =
  | { state: "pending"; batchStatus?: string | null }
  | { state: "done"; source: BatchResultSource; batchStatus?: string | null }
  | { state: "failed"; error: string; batchStatus?: string | null }
  | { state: "cancelled"; batchStatus?: string | null };

export type BatchReferenceImage = {
  sourceImageUrls?: string[];
  sourceImageUrl?: string | null;
  sourceImageUrl2?: string | null;
};

export function referenceUrlsForImage(image: BatchReferenceImage) {
  const storedUrls = image.sourceImageUrls?.filter((url): url is string =>
    Boolean(url),
  );
  if (storedUrls?.length) return storedUrls;
  return [image.sourceImageUrl, image.sourceImageUrl2].filter(
    (url): url is string => Boolean(url),
  );
}

export function isTransientPollStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
