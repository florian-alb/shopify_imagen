import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import type { ShopifyGalleryImage, VisualGroupWithRows } from "../types";
import {
  createVisualProductViewModels,
  shopifyImagesForVisualProduct,
} from "./visualProductWorkspace";

function group(
  overrides: Partial<VisualGroupWithRows> = {},
): VisualGroupWithRows {
  return {
    _id: "group-blue" as Id<"visualGroups">,
    _creationTime: 1,
    shopId: "shop" as Id<"shops">,
    configId: "config" as Id<"visualGroupConfigs">,
    productId: "product" as Id<"products">,
    key: "Couleur=Bleu",
    label: "Bleu",
    optionValues: [{ name: "Couleur", value: "Bleu" }],
    swatchCss: "#3b82f6",
    position: 0,
    createdAt: 1,
    updatedAt: 1,
    variants: [],
    references: [],
    ready: false,
    ...overrides,
  };
}

function image(
  overrides: Partial<Doc<"generatedImages">>,
): Doc<"generatedImages"> {
  return {
    _id: "image" as Id<"generatedImages">,
    _creationTime: 1,
    productId: "product" as Id<"products">,
    jobId: "job" as Id<"generationJobs">,
    visualGroupId: "group-blue" as Id<"visualGroups">,
    imageType: "Packshot",
    promptUsed: "Prompt",
    status: "generated",
    reviewStatus: "approved",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("createVisualProductViewModels", () => {
  it("treats every visual group as a child product", () => {
    const [result] = createVisualProductViewModels({
      parentTitle: "Ceinture",
      groups: [group({ ready: true })],
      members: [],
      images: [],
    });

    expect(result.title).toBe("Ceinture — Bleu");
    expect(result.status).toBe("ready_to_generate");
  });

  it("prioritizes newly approved images over an existing publication", () => {
    const [result] = createVisualProductViewModels({
      parentTitle: "Ceinture",
      groups: [group({ ready: true })],
      members: [
        {
          _id: "member" as Id<"visualProductFamilyMembers">,
          _creationTime: 1,
          shopId: "shop" as Id<"shops">,
          familyId: "family" as Id<"visualProductFamilies">,
          groupId: "group-blue" as Id<"visualGroups">,
          shopifyProductId: "gid://shopify/Product/1",
          title: "Ceinture bleue",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      images: [image({ storageUrl: "https://example.com/blue.webp" })],
    });

    expect(result.title).toBe("Ceinture bleue");
    expect(result.status).toBe("ready_to_publish");
    expect(result.primaryImageUrl).toBe("https://example.com/blue.webp");
  });

  it("marks a family member with uploaded images as published", () => {
    const [result] = createVisualProductViewModels({
      parentTitle: "Ceinture",
      groups: [group({ ready: true })],
      members: [],
      images: [
        image({
          status: "uploaded",
          storageUrl: "https://example.com/published.webp",
        }),
      ],
    });

    expect(result.status).toBe("published");
    expect(result.uploadedCount).toBe(1);
  });
});

describe("shopifyImagesForVisualProduct", () => {
  it("keeps only confirmed references in their configured order", () => {
    const references = [
      {
        _id: "reference-2",
        mediaId: "media-2",
        sourceUrl: "https://example.com/black-2.jpg",
        referenceUrl: "https://example.com/black-2.jpg",
        confirmed: true,
        position: 1,
        groupPosition: 0,
      },
      {
        _id: "reference-1",
        mediaId: "media-1",
        sourceUrl: "https://example.com/black-1.jpg",
        referenceUrl: "https://example.com/black-1.jpg",
        confirmed: true,
        position: 0,
        groupPosition: 1,
      },
      {
        _id: "reference-pending",
        mediaId: "media-pending",
        sourceUrl: "https://example.com/pending.jpg",
        referenceUrl: "https://example.com/pending.jpg",
        confirmed: false,
        position: 2,
        groupPosition: 2,
      },
    ] as Doc<"visualGroupReferences">[];
    const [visualProduct] = createVisualProductViewModels({
      parentTitle: "Mocassins",
      groups: [group({ ready: true, references })],
      members: [],
      images: [],
    });
    const shopifyImages: ShopifyGalleryImage[] = [
      {
        mediaId: "media-blue",
        url: "https://example.com/blue.jpg",
      },
      {
        mediaId: "media-1",
        url: "https://example.com/black-1.jpg",
      },
      {
        mediaId: "media-2",
        url: "https://example.com/black-2.jpg",
      },
    ];

    expect(
      shopifyImagesForVisualProduct(visualProduct, shopifyImages).map(
        (item) => item.mediaId,
      ),
    ).toEqual(["media-2", "media-1"]);
  });
});
