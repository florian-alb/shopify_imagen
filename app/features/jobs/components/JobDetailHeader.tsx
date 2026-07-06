import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw, X, Zap } from "lucide-react";
import { PageHeader, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reviewAggregateBadge } from "@/features/images/lib/review";
import type { Doc } from "@/lib/convex";
import { executionModeLabel } from "../lib/jobDetailViewModel";

export function JobDetailHeader({
  canCancelJob,
  canForcePoll,
  cancelling,
  job,
  jobState,
  polling,
  retrying,
  reviewBadge,
  onCancel,
  onForcePoll,
  onRetry,
}: {
  canCancelJob: boolean;
  canForcePoll: boolean;
  cancelling: boolean;
  job: Doc<"generationJobs">;
  jobState: "success" | "danger" | "warning";
  polling: boolean;
  retrying: boolean;
  reviewBadge: ReturnType<typeof reviewAggregateBadge>;
  onCancel: () => void;
  onForcePoll: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground"
        asChild
      >
        <Link to="/jobs">
          <ArrowLeft data-icon="inline-start" />
          Generations
        </Link>
      </Button>
      <PageHeader
        eyebrow={job.mode === "bulk" ? "Operation bulk" : "Operation produit"}
        title={`Job ${job._id.slice(-6)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state="neutral">
              {executionModeLabel(job.executionMode)}
            </StateBadge>
            <StateBadge>
              {job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}
            </StateBadge>
            <StateBadge state={jobState}>{job.status}</StateBadge>
            {job.batchStatus ? <StateBadge>{job.batchStatus}</StateBadge> : null}
            <StateBadge state={reviewBadge.tone}>{reviewBadge.label}</StateBadge>

            {canForcePoll ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onForcePoll}
                disabled={polling}
              >
                {polling ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Zap data-icon="inline-start" />
                )}
                Poll
              </Button>
            ) : null}

            {canCancelJob ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <X data-icon="inline-start" />
                )}
                Annuler
              </Button>
            ) : null}

            {job.status === "failed" || job.status === "cancelled" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={retrying}
              >
                {retrying ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                Relancer
              </Button>
            ) : null}
          </div>
        }
      />
    </>
  );
}
