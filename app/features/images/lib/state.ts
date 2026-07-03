import type { Doc } from "@/lib/convex";

import { getReviewStatus, isReviewable } from "./review";

export type GeneratedImageStateTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export function generatedImageStateLabel(image: Doc<"generatedImages">) {
  if (image.status === "failed") return "Error";
  if (image.status === "canceled") return "Canceled";
  if (image.status === "postprocessing") return "Post-processing";
  if (image.status === "uploaded") return "Pushed";
  if (!isReviewable(image)) return image.status;

  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "Approved";
  if (reviewStatus === "rejected") return "Rejected";
  return "To review";
}

export function generatedImageStateTone(
  image: Doc<"generatedImages">,
): GeneratedImageStateTone {
  if (image.status === "failed") return "danger";
  if (image.status === "canceled") return "danger";
  if (image.status === "uploaded") return "success";
  if (!isReviewable(image)) return "warning";

  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "success";
  if (reviewStatus === "rejected") return "danger";
  return "warning";
}
