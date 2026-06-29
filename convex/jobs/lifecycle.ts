import type { Doc } from "../_generated/dataModel";

type GeneratedImageStatus = Doc<"generatedImages">["status"];
type GenerationJobStatus = Doc<"generationJobs">["status"];

export function isTerminalJobStatus(status: GenerationJobStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isActiveImageStatus(status: GeneratedImageStatus) {
  return status === "queued" || status === "generating";
}

export function isRetryableImageStatus(status: GeneratedImageStatus) {
  return (
    status === "failed" ||
    status === "canceled" ||
    status === "queued" ||
    status === "generating"
  );
}

export function canResumeBackgroundRemoval(
  images: Doc<"generatedImages">[],
) {
  return images.every(
    (image) =>
      image.removeBackground === true &&
      Boolean(image.backgroundRemovalInputUrl),
  );
}

export function cancelImagePatch(args: {
  image: Doc<"generatedImages">;
  job: Doc<"generationJobs">;
  reason: string;
  now: number;
}) {
  return {
    status: "canceled" as const,
    error: args.reason,
    providerBatchId: args.image.providerBatchId ?? args.job.batchId,
    updatedAt: args.now,
  };
}

export function retryImagePatch(now: number) {
  return {
    status: "queued" as const,
    reviewStatus: "pending" as const,
    reviewedAt: undefined,
    reviewedByUserId: undefined,
    error: null,
    updatedAt: now,
  };
}

export function supersedeImagePatch(now: number) {
  return {
    status: "failed" as const,
    error: "Superseded by retry.",
    updatedAt: now,
  };
}

export function generatingProductPatch(now: number) {
  return {
    generationStatus: "generating" as const,
    generationState: "generating" as const,
    primaryAction: "wait" as const,
    updatedAt: now,
  };
}
