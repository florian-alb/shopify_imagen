import { describe, expect, test } from "vitest";

import type { Doc, Id } from "../../_generated/dataModel";
import { buildImageTasks } from "../../jobs/planning";

function product(
  overrides: Partial<Doc<"products">> = {},
): Doc<"products"> {
  return {
    _id: "product-1" as Id<"products">,
    _creationTime: 1,
    shopifyProductId: "gid://shopify/Product/1",
    title: "Sac en cuir",
    handle: "sac-en-cuir",
    tags: [],
    collections: [],
    options: [],
    variants: [],
    metafields: [],
    featuredImageUrl: "https://example.com/primary.jpg",
    currentShopifyImages: [
      { url: "https://example.com/primary.jpg" },
      { url: "https://example.com/secondary.jpg" },
      { url: "https://example.com/third.jpg" },
    ],
    generationStatus: "not_started",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function promptTemplate(
  overrides: Partial<Doc<"promptTemplates">> = {},
): Doc<"promptTemplates"> {
  return {
    _id: "prompt-1" as Id<"promptTemplates">,
    _creationTime: 1,
    imageType: "Studio — Side Profile",
    label: "Profil studio",
    content:
      "Photograph {{PRODUCT_TITLE}}.\nStrict left-facing composition.\nKeep the configured direction unchanged.",
    defaultContent: "",
    isActive: true,
    promptKind: "product_only",
    referenceImageCount: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function promptSettings(masterPrompt: string): Doc<"promptSettings"> {
  return {
    _id: "settings-1" as Id<"promptSettings">,
    _creationTime: 1,
    masterPrompt,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("buildImageTasks", () => {
  test("preserves the configured prompt without adding a product-category contract", () => {
    const template = promptTemplate();
    const { planned } = buildImageTasks({
      products: [product()],
      prompts: [template],
      promptSettings: promptSettings("Global catalog rules."),
      selectedImageTypes: [template.imageType],
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]?.promptUsed).toBe(
      "Global catalog rules.\n\nPhotograph Sac en cuir.\nStrict left-facing composition.\nKeep the configured direction unchanged.",
    );
    expect(planned[0]?.promptUsed).not.toMatch(/shoe|toe|heel|outsole/i);
  });

  test("respects the configured reference image count for every image type", () => {
    const template = promptTemplate({
      imageType: "Studio — Front 3/4 Pair",
      referenceImageCount: 1,
    });
    const { planned } = buildImageTasks({
      products: [product()],
      prompts: [template],
      promptSettings: null,
      selectedImageTypes: [template.imageType],
    });

    expect(planned[0]?.referenceImageCount).toBe(1);
    expect(planned[0]?.sourceImageUrls).toEqual([
      "https://example.com/primary.jpg",
    ]);
  });
});
