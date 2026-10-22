import { validateJobSearch, type JobSearch } from "./jobSearch";
import { reviewFilters, type ReviewFilter } from "./jobDetailViewModel";

export type JobDetailSearch = JobSearch & { images?: ReviewFilter };

export function validateJobDetailSearch(search: Record<string, unknown>): JobDetailSearch {
  return {
    ...validateJobSearch(search),
    images: reviewFilters.some((filter) => filter.value === search.images)
      ? (search.images as ReviewFilter)
      : undefined,
  };
}
