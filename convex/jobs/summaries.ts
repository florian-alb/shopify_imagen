import type { Doc, Id } from "../_generated/dataModel";
import { BATCH_PRICE_MULTIPLIER } from "../pricing";

export type JobCostSummary = {
  generationCost: number;
  inputTokens: number;
  outputTokens: number;
  pricedImageCount: number;
};

export type JobReviewSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type StoredReviewState =
  | "no-review"
  | "to-review"
  | "rejected"
  | "approved"
  | "partial";

export type ListedJob = Doc<"generationJobs"> & {
  costSummary: JobCostSummary;
  reviewSummary: JobReviewSummary;
};

type JobWithStoredCostSummary = Doc<"generationJobs"> & JobCostSummary;

export function imageCostForJob(
  job: Doc<"generationJobs">,
  image: Doc<"generatedImages">,
): number {
  const cost = image.costUsd ?? 0;
  const generationCost =
    job.executionMode === "batch" && image.costRateMultiplier == null
      ? cost * BATCH_PRICE_MULTIPLIER
      : cost;
  return generationCost + (image.backgroundRemovalCostUsd ?? 0);
}

export function summarizeImageCosts(
  job: Doc<"generationJobs">,
  images: Doc<"generatedImages">[],
): JobCostSummary {
  return {
    generationCost: images.reduce(
      (sum, image) => sum + imageCostForJob(job, image),
      0,
    ),
    inputTokens: images.reduce(
      (sum, image) => sum + (image.inputTokens ?? 0),
      0,
    ),
    outputTokens: images.reduce(
      (sum, image) => sum + (image.outputTokens ?? 0),
      0,
    ),
    pricedImageCount: images.filter(
      (image) =>
        image.costUsd != null || image.backgroundRemovalCostUsd != null,
    ).length,
  };
}

export function storedJobCostSummary(
  job: Doc<"generationJobs">,
): JobCostSummary {
  return {
    generationCost: job.generationCost ?? 0,
    inputTokens: job.inputTokens ?? 0,
    outputTokens: job.outputTokens ?? 0,
    pricedImageCount: job.pricedImageCount ?? 0,
  };
}

function hasStoredJobCostSummary(
  job: Doc<"generationJobs">,
): job is JobWithStoredCostSummary {
  return (
    job.generationCost != null &&
    job.inputTokens != null &&
    job.outputTokens != null &&
    job.pricedImageCount != null
  );
}

export function jobNeedsImageCostFallback(
  job: Doc<"generationJobs">,
): boolean {
  return !hasStoredJobCostSummary(job);
}

export function summarizeJobCostWithFallback(
  job: Doc<"generationJobs">,
  imagesByJob: Map<Id<"generationJobs">, Doc<"generatedImages">[]>,
): JobCostSummary {
  if (hasStoredJobCostSummary(job)) {
    return {
      generationCost: job.generationCost,
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      pricedImageCount: job.pricedImageCount,
    };
  }

  return summarizeImageCosts(job, imagesByJob.get(job._id) ?? []);
}

export function storedJobReviewSummary(
  job: Doc<"generationJobs">,
): JobReviewSummary {
  return {
    total: job.reviewTotal ?? 0,
    pending: job.reviewPending ?? 0,
    approved: job.reviewApproved ?? 0,
    rejected: job.reviewRejected ?? 0,
  };
}

export function getStoredReviewState(
  job: Doc<"generationJobs">,
): StoredReviewState {
  const total = job.reviewTotal ?? 0;
  const pending = job.reviewPending ?? 0;
  const approved = job.reviewApproved ?? 0;
  const rejected = job.reviewRejected ?? 0;
  if (total === 0) return "no-review";
  if (pending > 0) return "to-review";
  if (rejected === total) return "rejected";
  if (approved === total) return "approved";
  return "partial";
}

export function listedJob(job: Doc<"generationJobs">): ListedJob {
  return {
    ...job,
    costSummary: storedJobCostSummary(job),
    reviewSummary: storedJobReviewSummary(job),
  };
}
