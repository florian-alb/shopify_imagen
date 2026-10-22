import { createFileRoute } from "@tanstack/react-router";
import { JobDetailPage } from "@/features/jobs/components/JobDetailPage";

import { validateJobDetailSearch } from "@/features/jobs/lib/jobDetailSearch";

export const Route = createFileRoute("/jobs/$jobId")({
  validateSearch: validateJobDetailSearch,
  component: JobDetailRoute,
});

function JobDetailRoute() {
  const { jobId } = Route.useParams();

  return <JobDetailPage key={jobId} jobId={jobId} search={Route.useSearch()} />;
}
