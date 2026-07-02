import { createFileRoute } from "@tanstack/react-router";
import { JobDetailPage } from "@/features/jobs/components/JobDetailPage";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailRoute,
});

function JobDetailRoute() {
  const { jobId } = Route.useParams();

  return <JobDetailPage jobId={jobId} />;
}
