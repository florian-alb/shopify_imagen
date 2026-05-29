import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { EmptyState, PageHeader, StateBadge } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
        <EmptyState loading title="Loading job" body="Realtime job progress is coming from Convex." />
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
  const jobState = job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning";
  const jobCost = images.reduce((sum, image) => sum + (image.costUsd ?? 0), 0);
  const formatUsd = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

  return (
    <main className="page">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3 text-muted-foreground" asChild>
        <Link to="/jobs">
          <ArrowLeft data-icon="inline-start" />
          Jobs
        </Link>
      </Button>
      <PageHeader
        eyebrow={job.mode}
        title={`Job ${job._id.slice(-6)}`}
        action={
          <div className="flex items-center gap-2">
            <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
            <StateBadge state={jobState}>{job.status}</StateBadge>
          </div>
        }
      />

      <Card className="mb-4 rounded-lg">
        <CardContent className="pt-1">
          <div className="mb-3 flex justify-between text-sm">
            <span>{pct}% complete</span>
            <span className="text-muted-foreground">
              {job.completedTasks} done / {job.failedTasks} failed / {job.totalTasks} total · {formatUsd(jobCost)}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          {job.error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        {products.map((product) => (
          <Card key={product._id} size="sm" className="rounded-lg">
            <Link to="/products/$productId" params={{ productId: product._id }}>
              <CardContent>
                <p className="font-medium">{product.title}</p>
                <p className="text-sm text-muted-foreground">{product.handle}</p>
                {product.vibe ? (
                  <p className="mt-2 border-l-2 border-muted pl-2 text-sm italic text-muted-foreground">
                    <span className="font-medium not-italic">Scene vibe:</span> {product.vibe}
                  </p>
                ) : job.vibeAnalysis === false ? (
                  <p className="mt-2 text-xs text-muted-foreground">Vibe analysis was off for this job.</p>
                ) : null}
              </CardContent>
            </Link>
          </Card>
        ))}
      </section>

      <section className="grid gap-3">
        {images.map((image) => {
          const state = image.status === "generated" || image.status === "uploaded" ? "success" : image.status === "failed" ? "danger" : "warning";
          return (
            <Card key={image._id} size="sm" className="rounded-lg">
              <CardContent className="grid gap-3 md:grid-cols-[96px_1fr_auto] md:items-center">
                <div className="image-tile">
                  {image.storageUrl ? <img src={image.storageUrl} alt={image.imageType} /> : <div className="grid size-full place-items-center text-xs text-muted-foreground">Pending</div>}
                </div>
                <div>
                  <p className="font-medium">{image.imageType}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(image.createdAt).toLocaleString()}
                    {image.costUsd != null
                      ? ` · ${formatUsd(image.costUsd)} (${((image.inputTokens ?? 0) + (image.outputTokens ?? 0)).toLocaleString()} tok)`
                      : ""}
                  </p>
                  {image.error ? <p className="mt-1 text-sm text-destructive">{image.error}</p> : null}
                  {image.storageUrl ? (
                    <a className="mt-1 block break-all text-sm underline underline-offset-4" href={image.storageUrl} target="_blank" rel="noreferrer">
                      {image.storageUrl}
                    </a>
                  ) : null}
                </div>
                <StateBadge state={state}>{image.status}</StateBadge>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
