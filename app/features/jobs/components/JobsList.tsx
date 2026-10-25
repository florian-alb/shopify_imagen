import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StateBadge } from "@/components/page";
import { formatUsd } from "@/lib/formatters";
import type { useJobHistoryActions } from "../hooks/useJobHistoryActions";
import { jobNextAction, jobStatusLabels } from "../lib/jobListViews";
import type { JobSearch } from "../lib/jobSearch";
import type { ListedJob } from "../types";
import { JobHistoryMenu } from "./JobHistoryMenu";

export function JobsList({
  jobs,
  search,
  history,
}: {
  jobs: ListedJob[];
  search: JobSearch;
  history: ReturnType<typeof useJobHistoryActions>;
}) {
  return (
    <ol className="overflow-hidden rounded-xl border bg-card" aria-label="Lots de génération">
      {jobs.map((job) => (
        <JobListRow key={job._id} job={job} search={search} history={history} />
      ))}
    </ol>
  );
}

function JobListRow({
  job,
  search,
  history,
}: {
  job: ListedJob;
  search: JobSearch;
  history: ReturnType<typeof useJobHistoryActions>;
}) {
  const action = jobNextAction(job);
  const progress = job.totalTasks
    ? Math.min(100, Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100))
    : 0;
  const review = job.reviewSummary;
  const state =
    job.status === "completed"
      ? "success"
      : job.status === "failed"
        ? "danger"
        : job.status === "cancelled"
          ? "neutral"
          : "info";
  return (
    <li className="grid min-w-0 items-center gap-4 border-b p-4 last:border-0 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.5fr)_minmax(11rem,1.2fr)_minmax(9rem,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={state}>{jobStatusLabels[job.status]}</StateBadge>
          <span className="text-xs text-muted-foreground">
            {job.executionMode === "batch" ? "Batch" : "Temps réel"}
          </span>
        </div>
        <Link
          to="/jobs/$jobId"
          params={{ jobId: job._id }}
          search={search}
          className="font-semibold hover:text-primary"
        >
          {job.mode === "bulk" ? `Lot de ${job.productIds.length} produits` : "Produit unique"}{" "}
          <span className="font-normal text-muted-foreground">· {job._id.slice(-6)}</span>
        </Link>
        <p className="text-xs text-muted-foreground">
          {job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"} ·{" "}
          <time dateTime={new Date(job.createdAt).toISOString()}>
            {new Date(job.createdAt).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </time>
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium">Génération · {progress} % traités</p>
        <Progress value={progress} aria-label={`Progression du lot ${job._id.slice(-6)}`} />
        <p className="text-xs text-muted-foreground">
          {job.completedTasks} réussies ·{" "}
          <span className={job.failedTasks ? "text-destructive" : undefined}>
            {job.failedTasks} en échec
          </span>{" "}
          · {job.totalTasks} au total
        </p>
      </div>
      <div className="space-y-1 text-sm">
        <p className={review?.pending ? "font-medium text-foreground" : "text-muted-foreground"}>
          {review?.pending
            ? `${review.pending} image${review.pending === 1 ? "" : "s"} à vérifier`
            : review?.total
              ? "Vérification effectuée"
              : "Aucune image à vérifier"}
        </p>
        {Boolean(review?.total) && (
          <p className="text-xs text-muted-foreground">
            {review?.approved} approuvées · {review?.rejected} rejetées
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Coût enregistré :{" "}
          <span className="tabular-nums">
            {job.costSummary ? formatUsd(job.costSummary.generationCost) : "indisponible"}
          </span>
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 max-sm:border-t max-sm:pt-3">
        <Button
          size="sm"
          variant={action.label === "Vérifier" ? "default" : "outline"}
          className="max-sm:min-h-11 max-sm:flex-1"
          asChild
        >
          <Link
            to="/jobs/$jobId"
            params={{ jobId: job._id }}
            search={{ ...search, images: action.images }}
          >
            {action.label}
          </Link>
        </Button>
        <JobHistoryMenu
          job={job}
          busy={history.busyJobId !== null}
          onArchive={() => void history.toggleArchived(job)}
          onDelete={() => history.setDeleteTarget(job)}
        />
      </div>
    </li>
  );
}
