import type { Doc } from "@/lib/convex";

export const MAX_BULK_REORDER_PRODUCTS = 200;

type ReorderJob = Doc<"bulkReorderJobs">;

export function bulkReorderIsTerminal(status: ReorderJob["status"]) {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function bulkReorderStatusLabel(status: ReorderJob["status"]) {
  const labels: Record<ReorderJob["status"], string> = {
    queued: "En attente",
    running: "Réorganisation en cours",
    cancelling: "Annulation en cours",
    completed: "Terminée",
    partial: "Terminée avec alertes",
    failed: "Échec",
    cancelled: "Annulée",
  };
  return labels[status];
}

export function bulkReorderDisplayStatusLabel(job: ReorderJob) {
  if (job.restoreStatus === "queued") return "Restauration en attente";
  if (job.restoreStatus === "running") return "Restauration en cours";
  if (job.restoreStatus === "completed") return "Ordre original restauré";
  if (job.restoreStatus === "partial") {
    return "Restauration terminée avec alertes";
  }
  return bulkReorderStatusLabel(job.status);
}

export function bulkReorderProgress(job: ReorderJob) {
  const restoring = job.restoreStatus !== undefined;
  const completed = restoring
    ? (job.restoredItems ?? 0) +
      (job.restoreFailedItems ?? 0) +
      (job.restoreConflictItems ?? 0)
    : job.processedItems;
  const total = restoring ? (job.restoreTotalItems ?? 0) : job.productCount;
  return {
    completed,
    total,
    percent: total ? Math.min(100, (completed / total) * 100) : 0,
    restoring,
  };
}

export function bulkReorderCanCancel(job: ReorderJob) {
  return job.status === "queued" || job.status === "running";
}

export function bulkReorderCanRetry(job: ReorderJob) {
  if (job.dismissedAt) return false;
  if (job.restoreStatus === "partial") {
    return Boolean(
      (job.restoreFailedItems ?? 0) + (job.restoreConflictItems ?? 0),
    );
  }
  return (
    bulkReorderIsTerminal(job.status) &&
    job.restoreStatus === undefined &&
    Boolean(job.failedItems + job.conflictItems)
  );
}

export function bulkReorderCanRestore(job: ReorderJob) {
  return (
    bulkReorderIsTerminal(job.status) &&
    job.completedItems > 0 &&
    job.restoreStatus === undefined &&
    !job.dismissedAt
  );
}

export function bulkReorderEligibleCount(
  positions: Array<{
    position: number;
    productCount: number;
    unlockedProductCount?: number;
  }>,
  firstPosition: number,
  secondPosition: number,
) {
  if (firstPosition === secondPosition) return 0;
  const requiredPosition = Math.max(firstPosition, secondPosition);
  const option = positions.find(
    (position) => position.position === requiredPosition,
  );
  return option?.unlockedProductCount ?? option?.productCount ?? 0;
}

export function bulkReorderPositionLabel(
  firstPosition: number,
  secondPosition: number,
) {
  return `Positions ${firstPosition} ↔ ${secondPosition}`;
}
