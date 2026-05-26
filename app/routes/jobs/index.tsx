import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Badge, EmptyState, PageHeader } from "../../components/ui";
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
        <EmptyState title="Loading jobs" body="Fetching recent generation work from Convex." />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs yet" body="Create a generation job from the products page." />
      ) : (
        <section className="grid gap-3">
          {jobs.map((job) => {
            const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
            return (
              <Link key={job._id} to="/jobs/$jobId" params={{ jobId: job._id }} className="panel block p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{job.mode === "bulk" ? "Bulk generation" : "Single product generation"}</h2>
                    <p className="text-sm text-[var(--muted)]">{new Date(job.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning"}>
                    {job.status}
                  </Badge>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  {job.completedTasks} completed · {job.failedTasks} failed · {job.totalTasks} total
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
