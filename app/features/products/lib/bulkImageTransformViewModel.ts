import type { Doc } from "@/lib/convex";

type BulkTransformJob = Doc<"bulkTransformJobs">;

export const MAX_BULK_TRANSFORM_PRODUCTS = 250;

export function bulkTransformImagePositionsLabel(
  positions: number[] | null | undefined,
) {
  if (!positions) return "Toutes les positions";
  if (!positions.length) return "Aucune position";
  const visible = positions.slice(0, 5).map((position) => `n°${position}`);
  const remainder = positions.length - visible.length;
  return `Image${positions.length === 1 ? "" : "s"} ${visible.join(", ")}${remainder > 0 ? ` · +${remainder}` : ""}`;
}

export function resolveBulkImagePositionSelection(
  availablePositions: number[],
  selection: ReadonlySet<number> | null,
) {
  const available = new Set(availablePositions);
  return Array.from(selection ?? available)
    .filter((position) => available.has(position))
    .sort((a, b) => a - b);
}

export function toggleBulkImagePosition(
  availablePositions: number[],
  selection: ReadonlySet<number> | null,
  position: number,
) {
  const available = new Set(availablePositions);
  const next = new Set(selection ?? available);
  if (!available.has(position)) return next;
  if (next.has(position)) next.delete(position);
  else next.add(position);
  return next;
}

export function bulkTransformIsTerminal(status: BulkTransformJob["status"]) {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function bulkTransformCanPublish(job: BulkTransformJob) {
  return job.status === "ready" && bulkTransformReadyToPublishCount(job) > 0;
}

export function bulkTransformCanCancel(job: BulkTransformJob) {
  return (
    job.status === "queued" ||
    job.status === "transforming" ||
    job.status === "ready" ||
    job.status === "publishing"
  );
}

export function bulkTransformCanRetry(job: BulkTransformJob) {
  const retryableFailures =
    job.transformFailedItems + job.publishFailedItems + job.conflictItems;
  return (
    retryableFailures > 0 &&
    !job.dismissedAt &&
    !job.assetsCleanupStartedAt &&
    !job.assetsCleanedAt &&
    job.rollbackStatus === undefined &&
    job.status !== "cancelled" &&
    (job.status === "ready" || bulkTransformIsTerminal(job.status))
  );
}

export function bulkTransformRollbackCount(job: BulkTransformJob) {
  if (job.rollbackStatus === "partial") {
    return Math.max(0, job.rollbackFailedItems ?? 0);
  }
  if (job.rollbackStatus) return 0;
  return Math.max(0, job.publishedItems);
}

export function bulkTransformCanRollback(job: BulkTransformJob) {
  return (
    bulkTransformIsTerminal(job.status) &&
    !job.dismissedAt &&
    !job.assetsCleanupStartedAt &&
    !job.assetsCleanedAt &&
    bulkTransformRollbackCount(job) > 0
  );
}

export function bulkTransformReadyToPublishCount(job: BulkTransformJob) {
  return Math.max(
    0,
    job.transformedItems -
      job.publishedItems -
      job.publishFailedItems -
      job.conflictItems,
  );
}

export function bulkTransformProgress(job: BulkTransformJob) {
  if (job.rollbackStatus) {
    const total = job.rollbackTotalItems ?? job.publishedItems;
    const completed =
      (job.rolledBackItems ?? 0) +
      (job.rollbackFailedItems ?? 0) +
      (job.rollbackConflictItems ?? 0);
    return {
      phase: "rollback" as const,
      completed,
      total,
      percent: total > 0 ? Math.min(100, (completed / total) * 100) : 0,
      failed: (job.rollbackFailedItems ?? 0) + (job.rollbackConflictItems ?? 0),
    };
  }
  if (job.status === "queued") {
    const total = job.productIds.length;
    const completed = job.seededProductCount;
    return {
      phase: "seed" as const,
      completed,
      total,
      percent: total > 0 ? Math.min(100, (completed / total) * 100) : 0,
      failed: job.seedFailedProducts,
    };
  }
  const publishing =
    job.status === "publishing" ||
    job.status === "completed" ||
    job.status === "partial";
  const completed = publishing
    ? job.publishedItems + job.publishFailedItems + job.conflictItems
    : job.transformedItems + job.transformFailedItems + job.unsupportedItems;
  const total = publishing ? job.transformedItems : job.totalItems;
  return {
    phase: publishing ? ("publish" as const) : ("transform" as const),
    completed,
    total,
    percent: total > 0 ? Math.min(100, (completed / total) * 100) : 0,
    failed:
      job.transformFailedItems + job.publishFailedItems + job.conflictItems,
  };
}

export function bulkTransformDisplayStatusLabel(job: BulkTransformJob) {
  switch (job.rollbackStatus) {
    case "queued":
      return "Restauration planifiée";
    case "running":
      return "Restauration des originaux";
    case "completed":
      return "Originaux restaurés";
    case "partial":
      return "Restauration terminée avec alertes";
    default:
      return bulkTransformStatusLabel(job.status);
  }
}

export function bulkTransformStatusLabel(status: BulkTransformJob["status"]) {
  switch (status) {
    case "queued":
      return "Inventaire Shopify";
    case "transforming":
      return "Préparation des miroirs";
    case "ready":
      return "Prêt à publier";
    case "publishing":
      return "Remplacement sur Shopify";
    case "completed":
      return "Terminé";
    case "partial":
      return "Terminé avec erreurs";
    case "failed":
      return "Échec";
    case "cancelled":
      return "Annulé";
  }
}
