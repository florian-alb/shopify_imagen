import { ArrowLeftRight, FlipHorizontal2 } from "lucide-react";
import { StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ListedBulkOperation } from "../types";
import {
  bulkOperationAction,
  completionLabel,
  operationLabel,
  operationStatusLabel,
  progressLabel,
  resultSummary,
  statusTone,
} from "../lib/bulkOperationPresentation";

export function BulkOperationsList({
  jobs,
  onOpen,
}: {
  jobs: ListedBulkOperation[];
  onOpen: (job: ListedBulkOperation) => void;
}) {
  return (
    <ol
      className="overflow-hidden rounded-xl border bg-card"
      aria-label="Historique des opérations groupées"
    >
      {jobs.map((job) => (
        <BulkOperationRow key={job.key} job={job} onOpen={() => onOpen(job)} />
      ))}
    </ol>
  );
}

function BulkOperationRow({ job, onOpen }: { job: ListedBulkOperation; onOpen: () => void }) {
  const percent = job.totalItems ? Math.min(100, (job.processedItems / job.totalItems) * 100) : 0;
  const action = bulkOperationAction(job);
  return (
    <li className="grid min-w-0 items-center gap-4 border-b p-4 last:border-0 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_minmax(11rem,1fr)_minmax(10rem,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-1">
          <StateBadge state={statusTone(job)}>{operationStatusLabel(job)}</StateBadge>
          {job.dismissedAt && <StateBadge>Archivée</StateBadge>}
        </div>
        <h2 className="flex items-center gap-2 font-semibold">
          {job.operation === "reorder_media" ? (
            <ArrowLeftRight className="size-4 shrink-0" />
          ) : (
            <FlipHorizontal2 className="size-4 shrink-0" />
          )}
          {job.operation === "reorder_media" ? "Réorganisation" : "Miroir horizontal"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {job.productCount} produit{job.productCount === 1 ? "" : "s"} · {operationLabel(job)}
        </p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={new Date(job.createdAt).toISOString()}>
            {new Date(job.createdAt).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </time>{" "}
          · {job.id.slice(-6)}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium">
          {job.restoreStatus
            ? "Restauration"
            : job.operation === "reorder_media"
              ? "Traitement"
              : ["publishing", "completed", "partial"].includes(job.status)
                ? "Publication"
                : "Préparation"}
        </p>
        <Progress
          value={percent}
          aria-label={`Progression de l’opération ${job.id.slice(-6)}`}
          aria-valuetext={progressLabel(job)}
        />
        <p className="text-xs text-muted-foreground">{progressLabel(job)}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{completionLabel(job)}</p>
        <p
          className={`break-words text-xs ${job.details.error || job.restoreIssueItems ? "text-destructive" : "text-muted-foreground"}`}
        >
          {resultSummary(job)}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={job.status === "ready" && !job.restoreStatus ? "default" : "outline"}
        className="max-sm:min-h-11 max-sm:w-full sm:justify-self-end"
        onClick={onOpen}
      >
        {action}
      </Button>
    </li>
  );
}
