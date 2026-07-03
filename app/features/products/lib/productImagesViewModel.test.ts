import { describe, expect, it } from "vitest";

import type { Doc, Id } from "@/lib/convex";

import { createProductImagesViewModel } from "./productImagesViewModel";

function generatedImage(
  overrides: Partial<Omit<Doc<"generatedImages">, "_id">> & { _id?: string } = {},
): Doc<"generatedImages"> {
  const { _id, ...rest } = overrides;

  return {
    _creationTime: 1,
    imageType: "Hero",
    status: "generated",
    storageUrl: "https://example.com/generated.png",
    reviewStatus: "pending",
    ...rest,
    _id: (_id ??
      `image-${overrides.imageType ?? "default"}`) as Id<"generatedImages">,
  } as unknown as Doc<"generatedImages">;
}

function product(overrides: Partial<Doc<"products">> = {}): Doc<"products"> {
  return {
    _id: "product-1",
    _creationTime: 1,
    title: "Curtain",
    productType: "Drapery",
    collections: [{ title: "Living room" }],
    currentShopifyImages: [
      {
        mediaId: "gid://shopify/MediaImage/1",
        url: "https://example.com/shopify-1.png",
      },
      {
        id: "gid://shopify/MediaImage/2",
        url: "https://example.com/shopify-2.png",
      },
    ],
    primaryAction: "publish",
    generationState: "generated",
    reviewState: "approved",
    publishState: "ready",
    latestJobId: "job-1",
    shopifyProductId: "gid://shopify/Product/1234567890",
    ...overrides,
  } as unknown as Doc<"products">;
}

function promptTemplate(
  imageType: string,
  isActive: boolean,
): Doc<"promptTemplates"> {
  return {
    _id: `prompt-${imageType}`,
    _creationTime: 1,
    imageType,
    label: imageType,
    template: "prompt",
    isActive,
  } as unknown as Doc<"promptTemplates">;
}

describe("createProductImagesViewModel", () => {
  it("splits generated images by readiness, review state, and generation state", () => {
    const approved = generatedImage({
      _id: "approved",
      imageType: "Approved",
      reviewStatus: "approved",
    });
    const uploaded = generatedImage({
      _id: "uploaded",
      imageType: "Uploaded",
      status: "uploaded",
      reviewStatus: "approved",
    });
    const rejected = generatedImage({
      _id: "rejected",
      imageType: "Rejected",
      reviewStatus: "rejected",
    });
    const pending = generatedImage({
      _id: "pending",
      imageType: "Pending",
      reviewStatus: "pending",
    });
    const queued = generatedImage({
      _id: "queued",
      imageType: "Queued",
      status: "queued",
      storageUrl: undefined,
    });

    const viewModel = createProductImagesViewModel({
      product: product(),
      images: [approved, uploaded, rejected, pending, queued],
      prompts: [
        promptTemplate("active", true),
        promptTemplate("inactive", false),
      ],
      storeHandle: "demo-store",
    });

    expect(viewModel.availableTypes.map((prompt) => prompt.imageType)).toEqual([
      "active",
    ]);
    expect(viewModel.generatedGalleryImages.map((image) => image._id)).toEqual([
      "approved",
      "uploaded",
      "rejected",
      "pending",
    ]);
    expect(viewModel.generatingGalleryImages.map((image) => image._id)).toEqual(
      ["queued"],
    );
    expect(viewModel.readyImages.map((image) => image._id)).toEqual([
      "approved",
      "uploaded",
    ]);
    expect(viewModel.approvedImages.map((image) => image._id)).toEqual([
      "approved",
      "uploaded",
    ]);
    expect(viewModel.rejectedImages.map((image) => image._id)).toEqual([
      "rejected",
    ]);
    expect(viewModel.pendingImages.map((image) => image._id)).toEqual([
      "pending",
    ]);
  });

  it("keeps Shopify gallery facts and product state labels derivable", () => {
    const viewModel = createProductImagesViewModel({
      product: product(),
      images: [],
      prompts: undefined,
      storeHandle: "demo-store",
    });

    expect(viewModel.productCollections).toEqual([{ title: "Living room" }]);
    expect(viewModel.serverShopifyImages).toHaveLength(2);
    expect(viewModel.canReorderShopifyImages).toBe(true);
    expect(viewModel.hasProductJobs).toBe(true);
    expect(viewModel.shopifyAdminUrl).toBe(
      "https://admin.shopify.com/store/demo-store/products/1234567890",
    );
    expect(viewModel.primaryAction).toBe("publish");
    expect(viewModel.generationState).toBe("generated");
    expect(viewModel.reviewState).toBe("approved");
    expect(viewModel.publishState).toBe("ready");
  });
});
