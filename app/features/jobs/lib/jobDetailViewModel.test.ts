import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import {
  createJobDetailViewModel,
  imageDisplayCost,
  matchesJobReviewFilter,
} from "./jobDetailViewModel";

function generatedImage(
  overrides: Partial<Doc<"generatedImages">> = {},
): Doc<"generatedImages"> {
  return {
    _id: `image-${Math.random()}` as Id<"generatedImages">,
    _creationTime: 1,
    createdAt: 1,
    imageType: "hero",
    jobId: "job-1" as Id<"generationJobs">,
    productId: "product-1" as Id<"products">,
    sourceImageUrl: "https://example.com/source.png",
    status: "generated",
    storageUrl: "https://example.com/generated.png",
    ...overrides,
  } as Doc<"generatedImages">;
}

function product(
  overrides: Partial<Doc<"products">> = {},
): Doc<"products"> {
  return {
    _id: "product-1" as Id<"products">,
    _creationTime: 1,
    createdAt: 1,
    handle: "curtain",
    shopifyProductId: "gid://shopify/Product/1",
    shopId: "shop-1" as Id<"shops">,
    title: "Curtain",
    updatedAt: 1,
    ...overrides,
  } as Doc<"products">;
}

function generationJob(
  overrides: Partial<Doc<"generationJobs">> = {},
): Doc<"generationJobs"> {
  return {
    _id: "job-1" as Id<"generationJobs">,
    _creationTime: 1,
    completedTasks: 3,
    createdAt: 1,
    failedTasks: 1,
    mode: "bulk",
    shopId: "shop-1" as Id<"shops">,
    status: "running",
    totalTasks: 8,
    updatedAt: 1,
    ...overrides,
  } as Doc<"generationJobs">;
}

describe("job detail view model", () => {
  it("matches review filters the same way as the job detail UI", () => {
    const pending = generatedImage();
    const approved = generatedImage({ reviewStatus: "approved" });
    const rejected = generatedImage({ reviewStatus: "rejected" });
    const failed = generatedImage({ status: "failed", storageUrl: undefined });
    const pushed = generatedImage({
      reviewStatus: "approved",
      status: "uploaded",
    });

    expect(matchesJobReviewFilter(pending, "pending")).toBe(true);
    expect(matchesJobReviewFilter(approved, "approved")).toBe(true);
    expect(matchesJobReviewFilter(rejected, "rejected")).toBe(true);
    expect(matchesJobReviewFilter(failed, "failed")).toBe(true);
    expect(matchesJobReviewFilter(pushed, "pushed")).toBe(true);
    expect(matchesJobReviewFilter(failed, "pending")).toBe(false);
  });

  it("builds review counts, product rows, preview images, and push targets", () => {
    const productOne = product();
    const productTwo = product({
      _id: "product-2" as Id<"products">,
      handle: "voilage",
      shopifyProductId: "gid://shopify/Product/2",
      title: "Voilage",
    });
    const images = [
      generatedImage({ reviewStatus: "approved" }),
      generatedImage({ imageType: "detail" }),
      generatedImage({ imageType: "mood", reviewStatus: "rejected" }),
      generatedImage({
        _id: "product-2-image" as Id<"generatedImages">,
        productId: productTwo._id,
        reviewStatus: "approved",
      }),
      generatedImage({
        imageType: "failed",
        status: "failed",
        storageUrl: undefined,
      }),
      generatedImage({
        imageType: "uploaded",
        reviewStatus: "approved",
        status: "uploaded",
      }),
    ];

    const viewModel = createJobDetailViewModel({
      filter: "all",
      images,
      job: generationJob(),
      products: [productOne, productTwo],
      pushTargetProductId: productTwo._id,
      storeHandle: "demo-store",
    });

    expect(viewModel.reviewCounts).toEqual({
      approved: 3,
      failed: 1,
      pending: 1,
      pushed: 1,
      rejected: 1,
    });
    expect(viewModel.jobProgressPercent).toBe(50);
    expect(viewModel.productRows).toHaveLength(2);
    expect(viewModel.previewImages).toHaveLength(5);
    expect(viewModel.pushableImages).toHaveLength(2);
    expect(viewModel.selectedPushableImages).toHaveLength(1);
    expect(viewModel.selectedPushProductCount).toBe(1);
  });

  it("preserves the batch cost fallback when no explicit multiplier exists", () => {
    const job = generationJob({ executionMode: "batch" });

    expect(
      imageDisplayCost(
        generatedImage({ backgroundRemovalCostUsd: 2, costUsd: 10 }),
        job,
      ),
    ).toBe(7);
    expect(
      imageDisplayCost(
        generatedImage({
          backgroundRemovalCostUsd: 2,
          costRateMultiplier: 0.5,
          costUsd: 10,
        }),
        job,
      ),
    ).toBe(12);
  });
});
