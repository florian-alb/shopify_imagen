export type JobStatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type ExecutionModeFilter = "all" | "realtime" | "batch";
export type ProviderFilter = "all" | "openai" | "gemini";
export type JobReviewFilter = "all" | "to-review" | "approved" | "partial" | "rejected" | "no-review";

export type JobSearch = {
  productId?: string;
  status?: Exclude<JobStatusFilter, "all">;
  executionMode?: Exclude<ExecutionModeFilter, "all">;
  provider?: Exclude<ProviderFilter, "all">;
  review?: Exclude<JobReviewFilter, "all">;
  page?: number;
  pageSize?: number;
};

export const jobStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const executionModes = ["realtime", "batch"] as const;
export const providers = ["openai", "gemini"] as const;
export const jobReviewFilters = ["to-review", "approved", "partial", "rejected", "no-review"] as const;
export const jobPageSizes = [20, 50, 100] as const;

export function validateJobSearch(search: Record<string, unknown>): JobSearch {
  const page = parsePositiveInt(search.page);
  const pageSize = parsePageSize(search.pageSize);

  return {
    productId: typeof search.productId === "string" ? search.productId : undefined,
    status: optionalEnum(search.status, jobStatuses),
    executionMode: optionalEnum(search.executionMode, executionModes),
    provider: optionalEnum(search.provider, providers),
    review: optionalEnum(search.review, jobReviewFilters),
    page: page && page > 1 ? page : undefined,
    pageSize: pageSize && pageSize !== 20 ? pageSize : undefined,
  };
}

export function parsePositiveInt(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : undefined;

  return Number.isFinite(parsed) && parsed && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function parsePageSize(value: unknown) {
  const parsed = parsePositiveInt(value);

  return parsed && jobPageSizes.includes(parsed as (typeof jobPageSizes)[number]) ? parsed : undefined;
}

function optionalEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}
