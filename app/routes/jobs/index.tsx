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

function JobsPage() {
  const jobs = useQuery(api.jobs.list) as Doc<"generationJobs">[] | undefined;
  return (
    <main className="page">
      <PageHeader eyebrow="Jobs" title="Background generation jobs" />
      {jobs === undefined ? (
        <EmptyState loading title="Loading jobs" body="Fetching recent generation work from Convex." />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs yet" body="Create a generation job from the products page." />
      ) : (
        <section className="grid gap-3">
          {jobs.map((job) => {
            const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
            const state = job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning";
            return (
              <Card key={job._id} className="rounded-lg">
                <Link to="/jobs/$jobId" params={{ jobId: job._id }} className="flex flex-col gap-4">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle>{job.mode === "bulk" ? "Bulk generation" : "Single product generation"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
                      <StateBadge state={state}>{job.status}</StateBadge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Progress value={pct} className="h-2" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {job.completedTasks} completed / {job.failedTasks} failed / {job.totalTasks} total
                    </p>
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
