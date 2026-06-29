import type { Doc } from "../_generated/dataModel";

export function calculateProductStatus(images: Doc<"generatedImages">[]): Doc<"products">["generationStatus"] {
  if (!images.length) return "not_started";
  if (images.some((image) => image.status === "generating" || image.status === "queued")) return "generating";

  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (reviewable.some((image) => (image.reviewStatus ?? "pending") === "pending")) return "partial";
  if (reviewable.some((image) => image.status === "uploaded" && image.shopifyMediaId)) return "pushed";
  if (reviewable.some((image) => (image.reviewStatus ?? "pending") === "approved")) return "ready";
  if (images.every((image) => image.status === "failed")) return "failed";
  const hasGeneratedImage = images.some(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (!hasGeneratedImage && images.some((image) => image.status === "canceled")) return "canceled";
  if (reviewable.length) {
    return "partial";
  }
  if (images.some((image) => image.status === "failed")) return "partial";
  return "not_started";
}

export function calculateProductWorkflow(images: Doc<"generatedImages">[]) {
  const totalImageCount = images.length;
  const runningImageCount = images.filter((image) => image.status === "queued" || image.status === "generating").length;
  const failedImageCount = images.filter((image) => image.status === "failed").length;
  const canceledImageCount = images.filter((image) => image.status === "canceled").length;
  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  const generatedImageCount = reviewable.length;
  const pendingReviewCount = reviewable.filter((image) => (image.reviewStatus ?? "pending") === "pending").length;
  const approvedImageCount = reviewable.filter((image) => image.reviewStatus === "approved").length;
  const rejectedImageCount = reviewable.filter((image) => image.reviewStatus === "rejected").length;
  const publishedImageCount = reviewable.filter((image) => image.status === "uploaded" && image.shopifyMediaId).length;
  const publishableImageCount = reviewable.filter(
    (image) => image.reviewStatus === "approved" && !(image.status === "uploaded" && image.shopifyMediaId)
  ).length;

  let generationState: Doc<"products">["generationState"] = "not_started";
  if (totalImageCount === 0) generationState = "not_started";
  else if (runningImageCount > 0) generationState = "generating";
  else if (generatedImageCount === 0 && failedImageCount === totalImageCount) generationState = "failed";
  else if (generatedImageCount === 0 && canceledImageCount > 0) generationState = "canceled";
  else if (failedImageCount > 0 || canceledImageCount > 0) generationState = "incomplete";
  else generationState = "complete";

  let reviewState: Doc<"products">["reviewState"] = "none";
  if (generatedImageCount === 0) reviewState = "none";
  else if (pendingReviewCount > 0 && approvedImageCount > 0) reviewState = "partially_approved";
  else if (pendingReviewCount > 0) reviewState = "needs_review";
  else if (approvedImageCount === generatedImageCount) reviewState = "approved";
  else if (rejectedImageCount === generatedImageCount) reviewState = "rejected";
  else if (approvedImageCount > 0) reviewState = "partially_approved";
  else reviewState = "rejected";

  let publishState: Doc<"products">["publishState"] = "not_ready";
  if (approvedImageCount === 0) publishState = "not_ready";
  else if (publishedImageCount > 0 && publishedImageCount >= approvedImageCount) publishState = "pushed";
  else if (publishedImageCount > 0) publishState = "partially_pushed";
  else if (publishableImageCount > 0) publishState = "ready_to_push";

  let primaryAction: Doc<"products">["primaryAction"] = "generate";
  if (generationState === "not_started") primaryAction = "generate";
  else if (generationState === "generating") primaryAction = "wait";
  else if (reviewState === "needs_review" || reviewState === "partially_approved") primaryAction = "review";
  else if (publishState === "ready_to_push" || publishState === "partially_pushed") primaryAction = "push";
  else if (generationState === "failed" || generationState === "canceled" || generationState === "incomplete") {
    primaryAction = "fix_errors";
  } else if (publishState === "pushed") primaryAction = "done";
  else if (reviewState === "rejected") primaryAction = "generate";

  return {
    generationStatus: calculateProductStatus(images),
    generationState,
    reviewState,
    publishState,
    primaryAction,
    generatedImageCount,
    failedImageCount,
    publishedImageCount,
    publishableImageCount,
    pendingReviewCount,
    approvedImageCount,
    rejectedImageCount,
    latestJobId:
      images.reduce<Doc<"generatedImages"> | null>((latest, image) => {
        if (!latest) return image;
        return image.createdAt > latest.createdAt ? image : latest;
      }, null)?.jobId ?? null
  };
}
