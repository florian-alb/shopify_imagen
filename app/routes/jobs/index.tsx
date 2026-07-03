import { createFileRoute } from "@tanstack/react-router";
import { JobsPage } from "@/features/jobs/components/JobsPage";
import { validateJobSearch } from "@/features/jobs/lib/jobSearch";

export const Route = createFileRoute("/jobs/")({
  validateSearch: validateJobSearch,
  component: JobsRoute,
});

function JobsRoute() {
  const search = Route.useSearch();

  return <JobsPage search={search} />;
}
