import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo, type ReactNode } from "react";
import { EmptyState, NumberedPaginator, PageHeader, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

type ReviewSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type JobCostSummary = {
  generationCost: number;
  inputTokens: number;
  outputTokens: number;
  pricedImageCount: number;
};

type ListedJob = Doc<"generationJobs"> & {
  costSummary?: JobCostSummary;
  reviewSummary?: ReviewSummary;
};
type JobsPageResult = {
  page: ListedJob[];
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type JobStatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";
type ExecutionModeFilter = "all" | "realtime" | "batch";
type ProviderFilter = "all" | "openai" | "gemini";
type ReviewState = "none" | "pending" | "approved" | "partial" | "rejected";
type ReviewFilter = "all" | "to-review" | "approved" | "partial" | "rejected" | "no-review";
type JobSearch = {
  status?: Exclude<JobStatusFilter, "all">;
  executionMode?: Exclude<ExecutionModeFilter, "all">;
  provider?: Exclude<ProviderFilter, "all">;
  review?: Exclude<ReviewFilter, "all">;
  page?: number;
  pageSize?: number;
};

const emptyReviewSummary: ReviewSummary = { total: 0, pending: 0, approved: 0, rejected: 0 };
const jobStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;
const executionModes = ["realtime", "batch"] as const;
const providers = ["openai", "gemini"] as const;
const reviewFilters = ["to-review", "approved", "partial", "rejected", "no-review"] as const;
export const Route = createFileRoute("/jobs/")({
  validateSearch: validateJobSearch,
  component: JobsPage
});

function optionalEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value : undefined;
}

function validateJobSearch(search: Record<string, unknown>): JobSearch {
  const page = parsePositiveInt(search.page);
  const pageSize = parsePageSize(search.pageSize);
  return {
    status: optionalEnum(search.status, jobStatuses),
    executionMode: optionalEnum(search.executionMode, executionModes),
    provider: optionalEnum(search.provider, providers),
    review: optionalEnum(search.review, reviewFilters),
    page: page && page > 1 ? page : undefined,
    pageSize: pageSize && pageSize !== 20 ? pageSize : undefined
  };
}

function parsePositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : undefined;
  return Number.isFinite(parsed) && parsed && parsed > 0 ? Math.floor(parsed) : undefined;
}

function parsePageSize(value: unknown) {
  const parsed = parsePositiveInt(value);
  return parsed && [20, 50, 100].includes(parsed) ? parsed : undefined;
}

function formatUsd(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

function getReviewState(reviewSummary: ReviewSummary): ReviewState {
  if (reviewSummary.total === 0) return "none";
  if (reviewSummary.pending > 0) return "pending";
  if (reviewSummary.rejected === reviewSummary.total) return "rejected";
  if (reviewSummary.approved === reviewSummary.total) return "approved";
  return "partial";
}

function reviewBadge(reviewSummary: ReviewSummary) {
  const state = getReviewState(reviewSummary);
  if (state === "pending") return { tone: "warning" as const, label: `${reviewSummary.pending} to review` };
  if (state === "approved") return { tone: "success" as const, label: "Approved" };
  if (state === "partial") return { tone: "warning" as const, label: "Partial" };
  if (state === "rejected") return { tone: "danger" as const, label: "Rejected" };
  return { tone: "neutral" as const, label: "No images to review" };
}

function JobsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const jobsListArgs = useMemo(() => ({
    status: search.status,
    executionMode: search.executionMode,
    provider: search.provider,
    review: search.review
  }), [search.executionMode, search.provider, search.review, search.status]);
  const jobsPage = useQuery(
    api.jobs.list,
    {
      ...jobsListArgs,
      offset,
      limit: pageSize,
    },
  ) as JobsPageResult | undefined;
  const jobs = jobsPage?.page ?? [];
  const cost = useQuery(api.jobs.costSummary);
  const statusFilter: JobStatusFilter = search.status ?? "all";
  const executionModeFilter: ExecutionModeFilter = search.executionMode ?? "all";
  const providerFilter: ProviderFilter = search.provider ?? "all";
  const reviewFilter: ReviewFilter = search.review ?? "all";

  function updateSearch(patch: Partial<JobSearch>) {
    void navigate({ to: "/jobs", search: { ...search, ...patch }, replace: true });
  }

  function updateFilters(patch: Partial<JobSearch>) {
    updateSearch({ ...patch, page: undefined });
  }

  function updatePage(nextPage: number) {
    updateSearch({ page: nextPage > 1 ? nextPage : undefined });
  }

  function updatePageSize(nextPageSize: number) {
    updateSearch({
      page: undefined,
      pageSize: nextPageSize === 20 ? undefined : nextPageSize
    });
  }

  const hasActiveFilters =
    statusFilter !== "all" ||
    executionModeFilter !== "all" ||
    providerFilter !== "all" ||
    reviewFilter !== "all";

  const clearFilters = () => {
    updateSearch({
      status: undefined,
      executionMode: undefined,
      provider: undefined,
      review: undefined,
      page: undefined
    });
  };

  return (
    <main className="page">
      <PageHeader eyebrow="Jobs" title="Background generation jobs" />
      {cost ? (
        <Card className="mb-4 rounded-lg">
          <CardContent className="grid gap-4 pt-1 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total spent</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.totalCost)}</p>
              <p className="text-xs text-muted-foreground">
                {(cost.inputTokens + cost.outputTokens).toLocaleString()} tokens · {cost.pricedImageCount} images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Image generation</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.generationCost)}</p>
              <p className="text-xs text-muted-foreground">
                Real-time {formatUsd(cost.realtimeGenerationCost)} · Batch {formatUsd(cost.batchGenerationCost)}
              </p>
              <p className="text-xs text-muted-foreground">
                {cost.realtimeImageCount} real-time / {cost.batchImageCount} batch images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vibe analysis</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.analysisCost)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {jobsPage === undefined ? (
        <EmptyState loading title="Loading jobs" body="Fetching recent generation work from Convex." />
      ) : (
        <>
          <Card className="mb-4 rounded-lg py-3">
            <CardContent className="grid gap-3 px-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <FilterSelect
                value={statusFilter}
                placeholder="All states"
                onChange={(value) => updateFilters({ status: value === "all" ? undefined : value as JobSearch["status"] })}
              >
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={executionModeFilter}
                placeholder="Batch + realtime"
                onChange={(value) => updateFilters({ executionMode: value === "all" ? undefined : value as JobSearch["executionMode"] })}
              >
                <SelectItem value="realtime">Real-time</SelectItem>
                <SelectItem value="batch">Batch</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={reviewFilter}
                placeholder="All review states"
                onChange={(value) => updateFilters({ review: value === "all" ? undefined : value as JobSearch["review"] })}
              >
                <SelectItem value="to-review">To review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="no-review">No images to review</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={providerFilter}
                placeholder="All providers"
                onChange={(value) => updateFilters({ provider: value === "all" ? undefined : value as JobSearch["provider"] })}
              >
                <SelectItem value="gemini">Nano Banana Pro</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </FilterSelect>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasActiveFilters}
                  onClick={clearFilters}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {jobs.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? "No matching jobs" : "No jobs yet"}
              body={
                hasActiveFilters
                  ? "Adjust the filters to show more generation jobs."
                  : "Create a generation job from the products page."
              }
            />
          ) : (
            <section className="grid gap-3">
              {jobs.map((job) => {
                const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
                const state = job.status === "completed" ? "success" : job.status === "failed" || job.status === "cancelled" ? "danger" : "warning";
                const reviewSummary = job.reviewSummary ?? emptyReviewSummary;
                const review = reviewBadge(reviewSummary);
                return (
                  <Card key={job._id} className="rounded-lg py-3">
                    <Link to="/jobs/$jobId" params={{ jobId: job._id }} className="block">
                      <CardHeader className="flex flex-row items-start justify-between gap-3 px-3 pb-2 pt-0">
                        <div>
                          <CardTitle className="text-base">{job.mode === "bulk" ? "Bulk generation" : "Single product generation"}</CardTitle>
                          <p className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StateBadge state={job.executionMode === "batch" ? "success" : "neutral"}>{executionModeLabel(job.executionMode)}</StateBadge>
                          <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
                          <StateBadge state={state}>{job.status}</StateBadge>
                          <StateBadge state={review.tone}>{review.label}</StateBadge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-3 pb-0 pt-0">
                        <Progress value={pct} className="h-2" />
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{job.completedTasks} completed / {job.failedTasks} failed / {job.totalTasks} total</span>
                          {reviewSummary.total > 0 ? (
                            <span>{reviewSummary.approved} approved · {reviewSummary.pending} to review · {reviewSummary.rejected} rejected</span>
                          ) : null}
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                );
              })}
            </section>
          )}
          <NumberedPaginator
            page={page}
            pageSize={pageSize}
            hasPrevious={jobsPage?.hasPrevious ?? false}
            hasNext={jobsPage?.hasNext ?? false}
            loading={jobsPage === undefined}
            onPageChange={updatePage}
            onPageSizeChange={updatePageSize}
          />
        </>
      )}
    </main>
  );
}

function FilterSelect({
  value,
  placeholder,
  onChange,
  children,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}
