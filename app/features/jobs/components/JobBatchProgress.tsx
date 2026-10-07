import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { BatchJobProgress } from "../lib/batchJobProgress";

export function JobBatchProgress({ progress }: { progress: BatchJobProgress }) {
  const stages = [
    {
      label: "Préparation",
      detail: `${progress.preparedTasks} / ${progress.totalTasks} images prêtes`,
      active: progress.preparing,
    },
    {
      label: "Soumission",
      detail: `${progress.submittedTasks} / ${progress.totalTasks} images transmises`,
      active: progress.submitting,
    },
    {
      label: "Attente OpenAI",
      detail: `${progress.waitingTasks} images en attente`,
      active: progress.waiting,
    },
    {
      label: "Récupération",
      detail: `${progress.recoveredTasks} / ${progress.totalTasks} images traitées`,
      active: progress.recovering,
    },
  ];

  return (
    <div className="mt-4">
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={cn(
              "rounded-lg border p-3 text-sm",
              stage.active && "border-primary/50 bg-primary/5",
            )}
          >
            <dt className="flex flex-wrap items-center justify-between gap-1 font-medium">
              {stage.label}
              {stage.active ? (
                <span className="text-xs text-primary">En cours</span>
              ) : null}
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">{stage.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {progress.completedSegments} / {progress.segmentCount} segments terminés
        {progress.batchSize ? ` · ${progress.batchSize} images maximum par segment` : ""}
        {progress.concurrency ? ` · ${progress.concurrency} segments simultanés maximum` : ""}
      </p>

      {progress.uncertainCount ? (
        <Alert className="mt-3">
          <AlertDescription>
            {progress.uncertainCount} soumission(s) en cours de vérification auprès
            d’OpenAI. Les identifiants sont recherchés avant toute reprise pour
            éviter une double génération.
          </AlertDescription>
        </Alert>
      ) : null}

      {progress.errors.map(({ segmentId, label, error }) => (
        <Alert key={segmentId} variant="destructive" className="mt-3">
          <AlertDescription>
            {label} · Segment {segmentId.slice(-6)} : {error}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
