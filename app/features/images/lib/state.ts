import type { Doc } from "@/lib/convex";

import { getReviewStatus, hasImagePushError, isImagePushing, isReviewable } from "./review";

export type GeneratedImageStateTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export function generatedImageStateLabel(image: Doc<"generatedImages">) {
  if (image.activeRetryImageId) return "Régénération";
  if (isImagePushing(image)) return "Publication en cours";
  if (hasImagePushError(image)) return image.status === "uploaded" ? "Publiée · erreur" : "Publication en échec";
  if (image.status === "failed") return "Échec";
  if (image.status === "canceled") return "Annulée";
  if (image.status === "postprocessing") return "Finalisation";
  if (image.status === "uploaded") return "Publiée";
  if (image.status === "queued") return "En attente";
  if (image.status === "generating") return "Génération en cours";
  if (!isReviewable(image)) return image.status;

  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "Approuvée";
  if (reviewStatus === "rejected") return "Rejetée";
  return "À vérifier";
}

export function generatedImageStateTone(
  image: Doc<"generatedImages">,
): GeneratedImageStateTone {
  if (image.activeRetryImageId) return "warning";
  if (isImagePushing(image)) return "warning";
  if (hasImagePushError(image)) return "danger";
  if (image.status === "failed") return "danger";
  if (image.status === "canceled") return "danger";
  if (image.status === "uploaded") return "success";
  if (!isReviewable(image)) return "warning";

  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "success";
  if (reviewStatus === "rejected") return "danger";
  return "warning";
}
