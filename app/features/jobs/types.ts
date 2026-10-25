import type { Doc } from "@/lib/convex";

export type ReviewSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type JobCostSummary = {
  generationCost: number;
  inputTokens: number;
  outputTokens: number;
  pricedImageCount: number;
};

export type ListedJob = Doc<"generationJobs"> & {
  costSummary?: JobCostSummary;
  reviewSummary?: ReviewSummary;
};
export type JobsPageResult = {
  page: ListedJob[];
  offset: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

