import type { Doc } from "@/lib/convex";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ReviewAggregateState =
  | "none"
  | "pending"
  | "approved"
  | "partial"
  | "rejected";

export type ReviewAggregateCounts = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type ReviewAggregateBadge = {
  tone: "neutral" | "success" | "warning" | "danger";
  label: string;
};

export function getReviewStatus(image: Doc<"generatedImages">): ReviewStatus {
  return image.reviewStatus ?? "pending";
}

export function isReviewable(image: Doc<"generatedImages">) {
  return (
    Boolean(image.storageUrl) &&
    (image.status === "generated" || image.status === "uploaded")
  );
}

export function isPushReady(image: Doc<"generatedImages">) {
  return isReviewable(image) && getReviewStatus(image) === "approved";
}

export function getReviewAggregateState({
  total,
  pending,
  approved,
  rejected,
}: ReviewAggregateCounts): ReviewAggregateState {
  if (total === 0) return "none";
  if (pending > 0) return "pending";
  if (rejected === total) return "rejected";
  if (approved === total) return "approved";
  return "partial";
}

export function reviewAggregateBadge(
  counts: ReviewAggregateCounts,
  { emptyLabel = "No review" }: { emptyLabel?: string } = {},
): ReviewAggregateBadge {
  const state = getReviewAggregateState(counts);

  if (state === "pending") {
    return { tone: "warning", label: `${counts.pending} to review` };
  }
  if (state === "approved") return { tone: "success", label: "Approved" };
  if (state === "partial") return { tone: "warning", label: "Partial" };
  if (state === "rejected") return { tone: "danger", label: "Rejected" };
  return { tone: "neutral", label: emptyLabel };
}
