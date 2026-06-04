import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { EmptyState, PageHeader, StateBadge } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/jobs/")({
  component: JobsPage
});

type ReviewSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type ListedJob = Doc<"generationJobs"> & {
  reviewSummary?: ReviewSummary;
};

const emptyReviewSummary: ReviewSummary = { total: 0, pending: 0, approved: 0, rejected: 0 };

function formatUsd(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

function executionModeRateLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "50% rate" : "Full rate";
}

function JobsPage() {
  const jobs = useQuery(api.jobs.list) as ListedJob[] | undefined;
  const cost = useQuery(api.jobs.costSummary);
  return (
    <main className="page">
      <PageHeader eyebrow="Jobs" title="Background generation jobs" />
      {cost ? (
        <Card className="mb-4 rounded-lg">
          <CardContent className="grid gap-4 pt-1 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total spent</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.totalCost)}</p>
              <p className="text-xs text-muted-foreground">
                {(cost.inputTokens + cost.outputTokens).toLocaleString()} tokens · {cost.pricedImageCount} images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Image generation</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.generationCost)}</p>
              <p className="text-xs text-muted-foreground">
                Real-time {formatUsd(cost.realtimeGenerationCost)} · Batch {formatUsd(cost.batchGenerationCost)}
              </p>
              <p className="text-xs text-muted-foreground">
                {cost.realtimeImageCount} real-time / {cost.batchImageCount} batch images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vibe analysis</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.analysisCost)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {jobs === undefined ? (
        <EmptyState loading title="Loading jobs" body="Fetching recent generation work from Convex." />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs yet" body="Create a generation job from the products page." />
      ) : (
        <section className="grid gap-3">
          {jobs.map((job) => {
            const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
            const state = job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning";
            const reviewSummary = job.reviewSummary ?? emptyReviewSummary;
            const reviewState = reviewSummary.pending > 0 ? "warning" : reviewSummary.total > 0 ? "success" : "neutral";
            const reviewLabel =
              reviewSummary.pending > 0
                ? `${reviewSummary.pending} to review`
                : reviewSummary.total > 0
                  ? "Review complete"
                  : "No images to review";
            return (
              <Card key={job._id} className="rounded-lg">
                <Link to="/jobs/$jobId" params={{ jobId: job._id }} className="flex flex-col gap-4">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle>{job.mode === "bulk" ? "Bulk generation" : "Single product generation"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge state={job.executionMode === "batch" ? "success" : "neutral"}>{executionModeLabel(job.executionMode)}</StateBadge>
                      <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
                      <StateBadge state={state}>{job.status}</StateBadge>
                      <StateBadge state={reviewState}>{reviewLabel}</StateBadge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Progress value={pct} className="h-2" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {job.completedTasks} completed / {job.failedTasks} failed / {job.totalTasks} total · {executionModeRateLabel(job.executionMode)}
                    </p>
                    {reviewSummary.total > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review: {reviewSummary.approved} approved / {reviewSummary.pending} to review / {reviewSummary.rejected} rejected
                      </p>
                    ) : null}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}
