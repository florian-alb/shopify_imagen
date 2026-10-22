import type { Doc, Id } from "@/lib/convex";
import { canReviewImage, getReviewStatus, isImagePushing, isPushReady, isReviewable } from "../../images/lib/review";
import type { ProductImageView } from "./productWorkspaceSearch";

export const productImageViewLabels: Record<ProductImageView, string> = {
  all: "Toutes", pending: "À vérifier", ready: "Prêtes à publier", approved: "Approuvées",
  rejected: "Rejetées", published: "Publiées", running: "En cours", failed: "Échecs",
};

export function matchesProductImageView(image: Doc<"generatedImages">, view: ProductImageView) {
  switch (view) {
    case "pending": return isReviewable(image) && getReviewStatus(image) === "pending";
    case "approved": return isReviewable(image) && getReviewStatus(image) === "approved";
    case "rejected": return isReviewable(image) && getReviewStatus(image) === "rejected";
    case "ready": return isPushReady(image) && image.status !== "uploaded";
    case "published": return image.status === "uploaded";
    case "running": return image.status === "queued" || image.status === "generating" || image.status === "postprocessing" || Boolean(image.activeRetryImageId) || isImagePushing(image);
    case "failed": return image.status === "failed" || Boolean(image.pushError || image.retryError);
    default: return true;
  }
}

export function pendingReviewImages(images: Doc<"generatedImages">[]) {
  return images.filter(image => canReviewImage(image) && getReviewStatus(image) === "pending");
}

export function publicationImagesInScope(
  images: Doc<"generatedImages">[],
  groupId?: Id<"visualGroups"> | null,
) {
  return images.filter(image => isPushReady(image) && (!groupId || image.visualGroupId === groupId));
}

export function selectedPublicationImages(
  images: Doc<"generatedImages">[],
  selected: Set<Id<"generatedImages">>,
  groupId?: Id<"visualGroups"> | null,
) {
  return publicationImagesInScope(images, groupId).filter(image => selected.has(image._id));
}

export function initialPublicationSelection(images: Doc<"generatedImages">[], groupId?: Id<"visualGroups"> | null) {
  return new Set(publicationImagesInScope(images, groupId).filter(image => image.status !== "uploaded").map(image => image._id));
}
