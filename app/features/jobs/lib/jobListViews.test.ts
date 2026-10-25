import { describe, expect, it } from "vitest";
import type { ListedJob } from "../types";
import { jobListView, jobNextAction, searchForJobView } from "./jobListViews";
import { validateJobDetailSearch } from "./jobDetailSearch";
import { validateJobSearch } from "./jobSearch";

describe("generation work views", () => {
  it("replaces conflicting work filters while retaining the product and technical context", () => {
    const next = searchForJobView({
      productId: "product-1", provider: "gemini", executionMode: "batch",
      status: "failed", review: "rejected", archived: true, page: 4, pageSize: 50,
    }, "review");
    expect(next).toEqual({
      productId: "product-1", provider: "gemini", executionMode: "batch", pageSize: 50,
      status: undefined, review: "to-review", archived: undefined, page: undefined,
    });
    expect(jobListView(next)).toBe("review");
  });

  it("does not present a combined filter as an unfiltered preset", () => {
    expect(jobListView({ review: "to-review", status: "failed" })).toBe("custom");
    expect(jobListView({ archived: true, status: "completed" })).toBe("custom");
    expect(jobListView({ status: "queued" })).toBe("custom");
    expect(jobListView(searchForJobView({ status: "failed", page: 2 }, "archived"))).toBe("archived");
  });

  it("retains the list context through detail links and drops image filters on return", () => {
    const detail = validateJobDetailSearch({ productId: "p", page: "3", pageSize: "50", review: "to-review", images: "pending" });
    expect(detail.images).toBe("pending");
    expect(validateJobSearch(detail)).toMatchObject({ productId: "p", page: 3, pageSize: 50, review: "to-review" });
    expect(validateJobSearch(detail)).not.toHaveProperty("images");
    expect(validateJobDetailSearch({ images: "unknown", status: "unknown" })).toMatchObject({ images: undefined, status: undefined });
  });

  it("prioritizes failures, review and monitoring without equating approval with publication eligibility", () => {
    const job = { status: "completed", failedTasks: 0, reviewSummary: { total: 4, pending: 2, approved: 2, rejected: 0 } } as ListedJob;
    expect(jobNextAction(job)).toEqual({ label: "Vérifier", images: "pending" });
    expect(jobNextAction({ ...job, failedTasks: 1 }).images).toBe("failed");
    const reviewed = { ...job, reviewSummary: { ...job.reviewSummary!, pending: 0 } };
    expect(jobNextAction(reviewed)).toEqual({ label: "Voir les images", images: "approved" });
    expect(jobNextAction({ ...reviewed, status: "running" })).toEqual({ label: "Suivre", images: "all" });
  });
});
