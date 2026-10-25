import type { ListedJob } from "../types";
import type { JobSearch } from "./jobSearch";
import type { ReviewFilter } from "./jobDetailViewModel";

export const jobViews = [
  { value: "all", label: "Toutes" },
  { value: "review", label: "À vérifier" },
  { value: "running", label: "En cours" },
  { value: "completed", label: "Terminées" },
  { value: "failed", label: "En échec" },
  { value: "archived", label: "Archivées" },
] as const;
export type JobListView = (typeof jobViews)[number]["value"];
export const jobStatusLabels = {
  queued: "En attente",
  running: "En cours",
  completed: "Terminée",
  failed: "En échec",
  cancelled: "Annulée",
} as const;

export function jobListView(search: JobSearch): JobListView | "custom" {
  if (search.archived) return search.status || search.review ? "custom" : "archived";
  if (search.review === "to-review" && !search.status) return "review";
  if (search.review) return "custom";
  if (search.status === "running" || search.status === "completed" || search.status === "failed")
    return search.status;
  return search.status ? "custom" : "all";
}

export function searchForJobView(search: JobSearch, view: JobListView): JobSearch {
  return {
    ...search,
    page: undefined,
    archived: view === "archived" ? true : undefined,
    review: view === "review" ? "to-review" : undefined,
    status: view === "running" || view === "completed" || view === "failed" ? view : undefined,
  };
}

export function jobNextAction(job: ListedJob): { label: string; images: ReviewFilter } {
  if (job.status === "failed" || job.failedTasks > 0)
    return { label: "Examiner", images: "failed" };
  if ((job.reviewSummary?.pending ?? 0) > 0) return { label: "Vérifier", images: "pending" };
  if (job.status === "running" || job.status === "queued")
    return { label: "Suivre", images: "all" };
  if ((job.reviewSummary?.approved ?? 0) > 0)
    return { label: "Voir les images", images: "approved" };
  return { label: "Consulter", images: "all" };
}
