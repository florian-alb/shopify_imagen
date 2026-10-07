import {
  batchSegmentPhaseLabel,
  type JobBatchSegment,
} from "../lib/batchJobProgress";

export function JobBatchSegmentDetails({ segments }: { segments: JobBatchSegment[] }) {
  if (!segments.length) return null;

  return (
    <div className="mt-4 grid gap-2">
      <p className="text-sm font-medium">Segments internes du bulk</p>
      {segments.map((segment, index) => (
        <div key={segment._id} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">
            Segment {index + 1} · {batchSegmentPhaseLabel(segment)}
            {segment.status === "cancelled" ? " · Annulé" : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {segment.imageCount} images · {segment.ingestedCount ?? 0} récupérées
            {` · ${segment.failedCount ?? 0} échecs`}
            {segment.preparedTasks != null ? ` · ${segment.preparedTasks} préparées` : ""}
            {segment.batchStatus ? ` · ${segment.provider === "gemini" ? "Gemini" : "OpenAI"} : ${segment.batchStatus}` : ""}
          </p>
          {segment.batchId ? (
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              Batch ID : {segment.batchId}
            </p>
          ) : null}
          {segment.error ? (
            <p className="mt-1 text-sm text-destructive">{segment.error}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
