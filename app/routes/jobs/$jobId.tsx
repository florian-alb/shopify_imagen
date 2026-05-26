import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "../../components/ui";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailPage
});

type JobDetail = {
  job: Doc<"generationJobs">;
  images: Doc<"generatedImages">[];
  products: Doc<"products">[];
} | null;

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const data = useQuery(api.jobs.get, { jobId: jobId as Id<"generationJobs"> }) as JobDetail | undefined;

  if (data === undefined) {
    return (
      <main className="page">
        <EmptyState title="Loading job" body="Realtime job progress is coming from Convex." />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <EmptyState title="Job not found" body="The generation job could not be found." />
      </main>
    );
  }

  const { job, images, products } = data;
  const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;

  return (
    <main className="page">
      <Link to="/jobs" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
        <ArrowLeft size={16} />
        Jobs
      </Link>
      <PageHeader
        eyebrow={job.mode}
        title={`Job ${job._id.slice(-6)}`}
        action={<Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning"}>{job.status}</Badge>}
      />

      <section className="panel mb-4 p-4">
        <div className="mb-3 flex justify-between text-sm">
          <span>{pct}% complete</span>
          <span className="text-[var(--muted)]">
            {job.completedTasks} done · {job.failedTasks} failed · {job.totalTasks} total
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {job.error ? <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{job.error}</div> : null}
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        {products.map((product) => (
          <Link key={product._id} to="/products/$productId" params={{ productId: product._id }} className="panel p-3">
            <div className="font-semibold">{product.title}</div>
            <div className="text-sm text-[var(--muted)]">{product.handle}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-3">
        {images.map((image) => (
          <article key={image._id} className="panel grid gap-3 p-3 md:grid-cols-[96px_1fr_auto] md:items-center">
            <div className="image-tile">
              {image.storageUrl ? <img src={image.storageUrl} alt={image.imageType} /> : <div className="grid size-full place-items-center text-xs text-[var(--muted)]">Pending</div>}
            </div>
            <div>
              <div className="font-semibold">{image.imageType}</div>
              <div className="text-sm text-[var(--muted)]">Created {new Date(image.createdAt).toLocaleString()}</div>
              {image.error ? <div className="mt-1 text-sm text-[var(--danger)]">{image.error}</div> : null}
              {image.storageUrl ? (
                <a className="mt-1 block break-all text-sm text-[var(--accent)]" href={image.storageUrl} target="_blank" rel="noreferrer">
                  {image.storageUrl}
                </a>
              ) : null}
            </div>
            <Badge tone={image.status === "generated" || image.status === "uploaded" ? "success" : image.status === "failed" ? "danger" : "warning"}>
              {image.status}
            </Badge>
          </article>
        ))}
      </section>
    </main>
  );
}
