import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Doc } from "@/lib/convex";
import { formatUsd } from "@/lib/formatters";
import { executionModeRateLabel } from "../lib/jobDetailViewModel";

export function JobProgressCard({
  job,
  jobCost,
  progress,
}: {
  job: Doc<"generationJobs">;
  jobCost: number;
  progress: number;
}) {
  return (
    <Card className="mb-5 rounded-lg">
      <CardContent className="pt-1">
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
          <span>{progress}% termine</span>
          <span className="text-muted-foreground">
            {job.completedTasks} succes / {job.failedTasks} echecs /{" "}
            {job.totalTasks} total · {formatUsd(jobCost)} ·{" "}
            {executionModeRateLabel(job.executionMode)}
          </span>
        </div>
        <Progress value={progress} className="h-2" />

        {job.error ? (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{job.error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
