import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import type { VisualGroupWithRows } from "../types";
import { createVisualProductViewModels } from "./visualProductWorkspace";

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
