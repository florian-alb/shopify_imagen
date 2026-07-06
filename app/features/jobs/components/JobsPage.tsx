import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { FilterSelect } from "@/components/common/FilterSelect";
import { EmptyState, NumberedPaginator, PageHeader, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SelectItem } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reviewAggregateBadge } from "@/features/images/lib/review";
import { api, type Doc, type Id } from "@/lib/convex";
import { formatUsd } from "@/lib/formatters";
import type {
  ExecutionModeFilter,
  JobReviewFilter,
  JobSearch,
  JobStatusFilter,
  ProviderFilter,
} from "../lib/jobSearch";

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

const emptyReviewSummary: ReviewSummary = { total: 0, pending: 0, approved: 0, rejected: 0 };

function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

export function JobsPage({ search }: { search: JobSearch }) {
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const jobsListArgs = useMemo(() => ({
    productId: search.productId as Id<"products"> | undefined,
    status: search.status,
    executionMode: search.executionMode,
    provider: search.provider,
    review: search.review
  }), [search.executionMode, search.productId, search.provider, search.review, search.status]);
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
  const reviewFilter: JobReviewFilter = search.review ?? "all";

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
    Boolean(search.productId) ||
    statusFilter !== "all" ||
    executionModeFilter !== "all" ||
    providerFilter !== "all" ||
    reviewFilter !== "all";

  const clearFilters = () => {
    updateSearch({
      status: undefined,
      executionMode: undefined,
      provider: undefined,
      productId: undefined,
      review: undefined,
      page: undefined
    });
  };

  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 md:p-5">
      <PageHeader eyebrow={`${jobs.length} operations visibles`} title="Generations">
        Suivi des jobs image, review et couts d'execution.
      </PageHeader>
      {cost ? (
        <Card className="mb-4 rounded-lg">
          <CardContent className="grid gap-4 pt-1 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Depense totale</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.totalCost)}</p>
              <p className="text-xs text-muted-foreground">
                {(cost.inputTokens + cost.outputTokens).toLocaleString()} tokens · {cost.pricedImageCount} images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Generation image</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.generationCost)}</p>
              <p className="text-xs text-muted-foreground">
                Real-time {formatUsd(cost.realtimeGenerationCost)} · Batch {formatUsd(cost.batchGenerationCost)}
              </p>
              <p className="text-xs text-muted-foreground">
                {cost.realtimeImageCount} real-time / {cost.batchImageCount} batch images
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Analyse visuelle</p>
              <p className="text-2xl font-semibold">{formatUsd(cost.analysisCost)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {jobsPage === undefined ? (
        <EmptyState loading title="Chargement des generations" body="Lecture des operations recentes depuis Convex." />
      ) : (
        <>
          <Card className="mb-4 rounded-lg py-3">
            <CardContent className="grid gap-3 px-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <FilterSelect
                value={statusFilter}
                placeholder="Tous statuts"
                onChange={(value) => updateFilters({ status: value === "all" ? undefined : value as JobSearch["status"] })}
              >
                <SelectItem value="queued">En file</SelectItem>
                <SelectItem value="running">En cours</SelectItem>
                <SelectItem value="completed">Termine</SelectItem>
                <SelectItem value="failed">Echec</SelectItem>
                <SelectItem value="cancelled">Annule</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={executionModeFilter}
                placeholder="Execution"
                onChange={(value) => updateFilters({ executionMode: value === "all" ? undefined : value as JobSearch["executionMode"] })}
              >
                <SelectItem value="realtime">Real-time</SelectItem>
                <SelectItem value="batch">Batch</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={reviewFilter}
                placeholder="Review"
                onChange={(value) => updateFilters({ review: value === "all" ? undefined : value as JobSearch["review"] })}
              >
                <SelectItem value="to-review">A verifier</SelectItem>
                <SelectItem value="approved">Approuve</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="rejected">Rejete</SelectItem>
                <SelectItem value="no-review">Aucune review</SelectItem>
              </FilterSelect>
              <FilterSelect
                value={providerFilter}
                placeholder="Provider"
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
              title={hasActiveFilters ? "Aucune generation ne correspond" : "Aucun job"}
              body={
                hasActiveFilters
                  ? "Ajustez les filtres pour afficher plus de jobs."
                  : "Lancez une generation depuis la page produits."
              }
            />
          ) : (
            <Card className="overflow-hidden rounded-lg">
              <Table className="[&_td]:h-16 [&_th]:text-[0.72rem] [&_th]:font-medium [&_th]:text-muted-foreground min-w-[900px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Statut</TableHead>
                    <TableHead>Cible</TableHead>
                    <TableHead>En cours</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Cout</TableHead>
                    <TableHead>Demarree</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
                    const state = job.status === "completed" ? "success" : job.status === "failed" || job.status === "cancelled" ? "danger" : "warning";
                    const reviewSummary = job.reviewSummary ?? emptyReviewSummary;
                    const review = reviewAggregateBadge(reviewSummary, {
                      emptyLabel: "No images to review",
                    });
                    return (
                      <TableRow key={job._id}>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StateBadge state={state}>{job.status}</StateBadge>
                            <StateBadge state="neutral">{executionModeLabel(job.executionMode)}</StateBadge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link to="/jobs/$jobId" params={{ jobId: job._id }} className="font-medium hover:text-primary">
                            {job.mode === "bulk" ? "Generation bulk" : "Produit unique"}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground">{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</p>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-40 space-y-2">
                            <Progress value={pct} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {job.completedTasks} succes · {job.failedTasks} echecs · {job.totalTasks} total
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StateBadge state={review.tone}>{review.label}</StateBadge>
                            {reviewSummary.total > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {reviewSummary.approved} ok · {reviewSummary.pending} a voir · {reviewSummary.rejected} rej.
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {job.costSummary ? formatUsd(job.costSummary.generationCost) : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(job.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/jobs/$jobId" params={{ jobId: job._id }}>
                              Ouvrir
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
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
