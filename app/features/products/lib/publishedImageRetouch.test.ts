import { describe, expect, it } from "vitest";

import type { Doc, Id } from "@/lib/convex";

import { indexRetouchablePublishedImages } from "./publishedImageRetouch";

function generatedImage(
  overrides: Partial<Doc<"generatedImages">> = {},
): Doc<"generatedImages"> {
  return {
    _id: "image-1" as Id<"generatedImages">,
    _creationTime: 1,
    productId: "product-1" as Id<"products">,
    jobId: "job-1" as Id<"generationJobs">,
    imageType: "Hero",
    promptUsed: "Prompt",
    storageUrl: "https://example.com/image.webp",
    status: "uploaded",
    reviewStatus: "approved",
    shopifyMediaId: "gid://shopify/MediaImage/1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("indexRetouchablePublishedImages", () => {
  it("indexes uploaded generated images by their Shopify media id", () => {
    const published = generatedImage({
      _id: "published" as Id<"generatedImages">,
    });

    const result = indexRetouchablePublishedImages([published]);

    expect(result.get("gid://shopify/MediaImage/1")?._id).toBe(published._id);
  });

  it("excludes local and unlinked images", () => {
    const result = indexRetouchablePublishedImages([
      generatedImage({
        _id: "local" as Id<"generatedImages">,
        status: "generated",
      }),
      generatedImage({
        _id: "unlinked" as Id<"generatedImages">,
        shopifyMediaId: null,
      }),
    ]);

    expect(result.size).toBe(0);
  });

  it("keeps the newest matching image from a descending history", () => {
    const newest = generatedImage({
      _id: "newest" as Id<"generatedImages">,
    });
    const older = generatedImage({
      _id: "older" as Id<"generatedImages">,
    });

    const result = indexRetouchablePublishedImages([newest, older]);

    expect(result.get("gid://shopify/MediaImage/1")?._id).toBe(newest._id);
  });
});
