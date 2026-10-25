import type { Doc } from "@/lib/convex";
import type { ListedBulkOperation } from "../types";
import { bulkReorderStatusLabel } from "../../products/lib/bulkImageReorderViewModel";
import { bulkTransformStatusLabel } from "../../products/lib/bulkImageTransformViewModel";

export function statusTone(job: ListedBulkOperation) {
  if (job.restoreStatus === "completed") return "success" as const;
  if (
    job.restoreStatus === "running" ||
    job.restoreStatus === "queued" ||
    job.restoreStatus === "partial"
  ) {
    return "warning" as const;
  }
  if (job.status === "completed") return "success" as const;
  if (job.status === "failed" || job.status === "cancelled") {
    return "danger" as const;
  }
  return "warning" as const;
}

export function operationStatusLabel(job: ListedBulkOperation) {
  if (job.restoreStatus === "queued") return "Restauration en attente";
  if (job.restoreStatus === "running") return "Restauration en cours";
  if (job.restoreStatus === "completed") return "Original restauré";
  if (job.restoreStatus === "partial") return "Restauration avec alertes";
  return job.operation === "reorder_media"
    ? bulkReorderStatusLabel(job.status as Doc<"bulkReorderJobs">["status"])
    : bulkTransformStatusLabel(job.status as Doc<"bulkTransformJobs">["status"]);
}

export function operationLabel(job: ListedBulkOperation) {
  return job.operation === "reorder_media"
    ? `Positions ${job.details.firstPosition} ↔ ${job.details.secondPosition}`
    : job.details.selectedImagePositions?.length
      ? `${job.details.selectedImagePositions.length} position${job.details.selectedImagePositions.length === 1 ? "" : "s"}`
      : "Toutes les images";
}

export function resultSummary(job: ListedBulkOperation) {
  if (job.details.error) return job.details.error;
  if (job.restoreStatus === "completed") {
    return "Aucun conflit de restauration";
  }
  if (job.restoreIssueItems) {
    return `${job.restoreIssueItems} restauration${job.restoreIssueItems === 1 ? "" : "s"} en échec ou conflit`;
  }
  if (job.issueItems) {
    return `${job.issueItems} élément${job.issueItems === 1 ? "" : "s"} ignoré${job.issueItems === 1 ? "" : "s"}, en échec ou conflit`;
  }
  if (job.status === "ready") return "Préparation terminée. Publication à confirmer.";
  if (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "transforming" ||
    job.status === "publishing" ||
    job.restoreStatus === "queued" ||
    job.restoreStatus === "running"
  ) {
    return "Traitement en cours";
  }
  return "Aucune erreur";
}

export function progressLabel(job: ListedBulkOperation) {
  if (job.restoreStatus) {
    return `${job.processedItems}/${job.totalItems} élément${job.totalItems === 1 ? "" : "s"} restauré${job.processedItems === 1 ? "" : "s"} ou vérifié${job.processedItems === 1 ? "" : "s"}`;
  }
  if (job.operation === "reorder_media") {
    return `${job.processedItems}/${job.totalItems} produits vérifiés`;
  }
  if (job.status === "queued") {
    return `${job.processedItems}/${job.totalItems} produits inventoriés`;
  }
  if (job.status === "publishing" || job.status === "completed" || job.status === "partial") {
    return `${job.processedItems}/${job.totalItems} images publiées ou vérifiées`;
  }
  return `${job.processedItems}/${job.totalItems} images préparées ou vérifiées`;
}

export function completionLabel(job: ListedBulkOperation) {
  if (job.restoreStatus) {
    return `${job.restoredItems ?? 0} restauré${(job.restoredItems ?? 0) === 1 ? "" : "s"}`;
  }
  if (job.operation === "reorder_media") {
    return `${job.completedItems} galerie${job.completedItems === 1 ? " réorganisée" : "s réorganisées"}`;
  }
  const completed =
    job.status === "publishing" || job.status === "completed" || job.status === "partial"
      ? job.details.publishedItems
      : job.details.transformedItems;
  return `${completed} image${completed === 1 ? "" : "s"} ${job.status === "publishing" || job.status === "completed" || job.status === "partial" ? "publiée" : "préparée"}${completed === 1 ? "" : "s"}`;
}

export function bulkOperationAction(job: ListedBulkOperation) {
  if (job.restoreStatus === "queued" || job.restoreStatus === "running")
    return "Suivre la restauration";
  if (job.restoreStatus === "completed") return "Voir le bilan";
  if (job.restoreStatus === "partial" || job.restoreIssueItems) return "Examiner la restauration";
  if (job.status === "ready") return "Vérifier et publier";
  if (["queued", "running", "transforming", "publishing"].includes(job.status)) return "Suivre";
  if (job.status === "failed" || job.status === "partial" || job.issueItems || job.details.error)
    return "Examiner";
  return "Voir le bilan";
}
