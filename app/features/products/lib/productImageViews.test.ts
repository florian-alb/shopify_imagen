import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import { initialPublicationSelection, matchesProductImageView, pendingReviewImages, publicationImagesInScope, selectedPublicationImages } from "./productImageViews";

function image(id: string, overrides: Partial<Doc<"generatedImages">> = {}): Doc<"generatedImages"> {
  return { _id: id as Id<"generatedImages">, status: "generated", reviewStatus: "approved", storageUrl: "/fixture.svg", ...overrides } as Doc<"generatedImages">;
}
const groupA = "group-a" as Id<"visualGroups">;
const groupB = "group-b" as Id<"visualGroups">;

describe("product image work scopes", () => {
  it("never publishes hidden groups or stale selected IDs", () => {
    const a = image("a", { visualGroupId: groupA });
    const b = image("b", { visualGroupId: groupB });
    const pending = image("pending", { visualGroupId: groupA, reviewStatus: "pending" });
    const rows = [a, b, pending];
    const selection = new Set([a._id, b._id, pending._id, "deleted" as Id<"generatedImages">]);
    expect(publicationImagesInScope(rows, groupA)).toEqual([a]);
    expect(selectedPublicationImages(rows, selection, groupA)).toEqual([a]);
    expect(selectedPublicationImages(rows, selection, "missing" as Id<"visualGroups">)).toEqual([]);
  });

  it("keeps explicit republication available and excludes retrying or publishing images", () => {
    const uploaded = image("uploaded", { status: "uploaded" });
    const retrying = image("retry", { activeRetryImageId: "new" as Id<"generatedImages"> });
    const pushing = image("push", { pushRunId: "run" as Id<"imagePublishRuns"> });
    expect(publicationImagesInScope([uploaded, retrying, pushing])).toEqual([uploaded]);
    expect(matchesProductImageView(uploaded, "published")).toBe(true);
    expect(matchesProductImageView(uploaded, "ready")).toBe(false);
    expect(initialPublicationSelection([uploaded, image("new"), retrying, pushing])).toEqual(new Set(["new"]));
    expect(selectedPublicationImages([uploaded], new Set([uploaded._id]))).toEqual([uploaded]);
    expect(matchesProductImageView(retrying, "running")).toBe(true);
    expect(matchesProductImageView(pushing, "running")).toBe(true);
  });

  it("bulk approval only includes actionable pending images, including legacy missing review status", () => {
    const pending = image("pending", { reviewStatus: undefined });
    const rejected = image("rejected", { reviewStatus: "rejected" });
    const pushing = image("push", { reviewStatus: "pending", pushRunId: "run" as Id<"imagePublishRuns"> });
    expect(pendingReviewImages([pending, rejected, pushing])).toEqual([pending]);
    expect(matchesProductImageView(pending, "pending")).toBe(true);
    expect(matchesProductImageView(rejected, "rejected")).toBe(true);
  });

  it("exposes generation and Shopify failures even when an image already exists", () => {
    expect(matchesProductImageView(image("failed", { status: "failed", storageUrl: undefined }), "failed")).toBe(true);
    expect(matchesProductImageView(image("push-error", { pushError: "Shopify unavailable" }), "failed")).toBe(true);
    expect(matchesProductImageView(image("retry-error", { retryError: "Generation unavailable" }), "failed")).toBe(true);
    expect(matchesProductImageView(image("healthy"), "failed")).toBe(false);
  });
});
