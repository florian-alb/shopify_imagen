import { getReviewStatus, isPushReady, isReviewable } from "../../images/lib/review";
import { getShopifyAdminUrl } from "../../shopify/lib/admin";
import type { Doc, Id } from "../../../lib/convex";

export type ReviewFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "failed"
  | "pushed";

export const reviewFilters: { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Errors" },
  { value: "pushed", label: "Pushed" },
];

export type JobProductRow = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
  publishableCount: number;
  shopifyAdminUrl: string | null;
};

export type JobReviewCounts = {
  pending: number;
  approved: number;
  rejected: number;
  failed: number;
  pushed: number;
};

export type JobDetailViewModel = {
  approvedImages: Doc<"generatedImages">[];
  canCancelJob: boolean;
  canForcePoll: boolean;
  failedCount: number;
  jobCost: number;
  jobProgressPercent: number;
  jobState: "success" | "danger" | "warning";
  pendingCount: number;
  previewImages: Doc<"generatedImages">[];
  productRows: JobProductRow[];
  pushedCount: number;
  pushableImages: Doc<"generatedImages">[];
  rejectedCount: number;
  reviewableImages: Doc<"generatedImages">[];
  reviewCounts: JobReviewCounts;
  selectedPushableImages: Doc<"generatedImages">[];
  selectedPushProductCount: number;
  visibleImages: Doc<"generatedImages">[];
  visibleReviewable: Doc<"generatedImages">[];
};

export function matchesJobReviewFilter(
  image: Doc<"generatedImages">,
  filter: ReviewFilter,
) {
  if (filter === "all") return true;
  if (filter === "failed") return image.status === "failed";
  if (filter === "pushed") return image.status === "uploaded";
  return isReviewable(image) && getReviewStatus(image) === filter;
}

export function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

export function executionModeRateLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "50% rate" : "Full rate";
}

export function imageDisplayCost(
  image: Doc<"generatedImages">,
  job: Doc<"generationJobs">,
) {
  const cost = image.costUsd ?? 0;
  const generationCost =
    job.executionMode === "batch" && image.costRateMultiplier == null
      ? cost * 0.5
      : cost;

  return generationCost + (image.backgroundRemovalCostUsd ?? 0);
}

export function createJobDetailViewModel({
  filter,
  images,
  job,
  products,
  pushTargetProductId,
  storeHandle,
}: {
  filter: ReviewFilter;
  images: Doc<"generatedImages">[];
  job: Doc<"generationJobs">;
  products: Doc<"products">[];
  pushTargetProductId: Id<"products"> | null;
  storeHandle: string | null | undefined;
}): JobDetailViewModel {
  const reviewableImages = images.filter(isReviewable);
  const approvedImages = reviewableImages.filter(
    (image) => getReviewStatus(image) === "approved",
  );
  const pendingCount = reviewableImages.filter(
    (image) => getReviewStatus(image) === "pending",
  ).length;
  const rejectedCount = reviewableImages.filter(
    (image) => getReviewStatus(image) === "rejected",
  ).length;
  const failedCount = images.filter((image) => image.status === "failed").length;
  const pushedCount = images.filter(
    (image) => image.status === "uploaded",
  ).length;
  const visibleImages = images.filter((image) =>
    matchesJobReviewFilter(image, filter),
  );
  const visibleReviewable = visibleImages.filter(isReviewable);
  const pushableImages = images.filter(
    (image) => isPushReady(image) && image.status === "generated",
  );
  const previewImages = reviewableImages.filter((image) => image.storageUrl);
  const productRows = products
    .map((product) => ({
      product,
      images: visibleImages.filter((image) => image.productId === product._id),
      publishableCount: pushableImages.filter(
        (image) => image.productId === product._id,
      ).length,
      shopifyAdminUrl: getShopifyAdminUrl(product, storeHandle),
    }))
    .filter((row) => row.images.length > 0);
  const selectedPushableImages = pushTargetProductId
    ? pushableImages.filter((image) => image.productId === pushTargetProductId)
    : pushableImages;
  const selectedPushProductCount = new Set(
    selectedPushableImages.map((image) => image.productId),
  ).size;

  return {
    approvedImages,
    canCancelJob: job.status === "queued" || job.status === "running",
    canForcePoll:
      job.executionMode === "batch" &&
      Boolean(job.batchId) &&
      job.status === "running",
    failedCount,
    jobCost: images.reduce((sum, image) => sum + imageDisplayCost(image, job), 0),
    jobProgressPercent: job.totalTasks
      ? Math.round(
          ((job.completedTasks + job.failedTasks) / job.totalTasks) * 100,
        )
      : 0,
    jobState:
      job.status === "completed"
        ? "success"
        : job.status === "failed"
          ? "danger"
          : "warning",
    pendingCount,
    previewImages,
    productRows,
    pushedCount,
    pushableImages,
    rejectedCount,
    reviewableImages,
    reviewCounts: {
      pending: pendingCount,
      approved: approvedImages.length,
      rejected: rejectedCount,
      failed: failedCount,
      pushed: pushedCount,
    },
    selectedPushableImages,
    selectedPushProductCount,
    visibleImages,
    visibleReviewable,
  };
}
