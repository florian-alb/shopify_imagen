import { describe, expect, test } from "vitest";

import type { Doc, Id } from "../../_generated/dataModel";
import { buildImageTasks } from "../../jobs/planning";

function product(overrides: Partial<Doc<"products">> = {}): Doc<"products"> {
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

  test("keeps the merchant-defined visual reference order", () => {
    const template = promptTemplate({ referenceImageCount: 2 });
    const { planned } = buildImageTasks({
      products: [product()],
      prompts: [template],
      promptSettings: null,
      selectedImageTypes: [template.imageType],
      visualTargets: [
        {
          productId: "product-1" as Id<"products">,
          groupId: "group-red" as Id<"visualGroups">,
          key: "Couleur=Rouge",
          label: "Rouge",
          optionValues: [{ name: "Couleur", value: "Rouge" }],
          referenceUrls: [
            "https://example.com/selected-first.jpg",
            "https://example.com/selected-second.jpg",
            "https://example.com/shopify-first.jpg",
          ],
        },
      ],
    });

    expect(planned[0]?.sourceImageUrls).toEqual([
      "https://example.com/selected-first.jpg",
      "https://example.com/selected-second.jpg",
    ]);
    expect(planned[0]?.sourceImageUrl).toBe(
      "https://example.com/selected-first.jpg",
    );
  });
  const variants = [
    {
      id: "variant-20",
      title: "Rouge / 20 cm",
      selectedOptions: [
        { name: "Couleur", value: "Rouge" },
        { name: "Taille", value: "20 cm" },
      ],
    },
    {
      id: "variant-40",
      title: "Rouge / 40 cm",
      selectedOptions: [
        { name: "Couleur", value: "Rouge" },
        { name: "Taille", value: "40 cm" },
      ],
    },
    {
      id: "variant-blue",
      title: "Bleu",
      selectedOptions: [{ name: "Couleur", value: "Bleu" }],
    },
  ];
  function variantPlan(
    selection: "first" | "all" | undefined,
    overrides: Partial<Parameters<typeof buildImageTasks>[0]> = {},
  ) {
    return buildImageTasks({
      products: [product({ variants })],
      prompts: [
        promptTemplate({
          content: "Sized {{VARIANT_TITLE}} {{OPTION_VALUE:Taille}}",
          condition: {
            field: "option_value",
            optionName: "Taille",
            operator: "present",
          },
          alternativeContent: "No size {{VARIANT_TITLE}}",
        }),
      ],
      promptSettings: promptSettings("Master"),
      selectedImageTypes: ["Studio — Side Profile"],
      variantSelection: selection,
      ...overrides,
    }).planned;
  }
  test("evaluates each variant separately and preserves Shopify order", () => {
    const tasks = variantPlan("all");
    expect(tasks).toHaveLength(3);
    expect(tasks.map((task) => task.generationTarget.shopifyVariantId)).toEqual(
      ["variant-20", "variant-40", "variant-blue"],
    );
    expect(tasks.map((task) => task.promptBranch)).toEqual([
      "if_true",
      "if_true",
      "otherwise",
    ]);
    expect(tasks[0].promptUsed).toContain(
      "Master\n\nSized Rouge / 20 cm 20 cm",
    );
    expect(tasks[1].promptUsed).toContain("40 cm");
    expect(tasks[2].promptUsed).toContain("Master\n\nNo size Bleu");
    expect(variantPlan("first")).toHaveLength(1);
    expect(variantPlan(undefined)).toHaveLength(1);
  });
  test("restricts first/all to selected groups and keeps confirmed reference order", () => {
    const groups = [
      {
        productId: "product-1" as Id<"products">,
        groupId: "group-blue" as Id<"visualGroups">,
        key: "Couleur=Bleu",
        label: "Bleu",
        optionValues: [{ name: "Couleur", value: "Bleu" }],
        variantIds: ["variant-blue"],
        referenceUrls: ["https://example.com/confirmed.jpg"],
      },
    ];
    const task = variantPlan("first", { visualTargets: groups })[0];
    expect(task.generationTarget.shopifyVariantId).toBe("variant-blue");
    expect(task.sourceImageUrl).toBe("https://example.com/confirmed.jpg");
    expect(variantPlan("all", { visualTargets: groups })).toHaveLength(1);
  });
  test("uses one representative per separated group and the sibling title", () => {
    const groups = [
      {
        productId: "product-1" as Id<"products">,
        groupId: "group-red" as Id<"visualGroups">,
        key: "Couleur=Rouge",
        label: "Rouge",
        optionValues: [{ name: "Couleur", value: "Rouge" }],
        variantIds: ["variant-20", "variant-40"],
        referenceUrls: ["https://example.com/red.jpg"],
        separated: true,
        productTitle: "Peluche rouge séparée",
      },
    ];
    const tasks = variantPlan("all", { visualTargets: groups });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].generationTarget).toMatchObject({
      kind: "group",
      shopifyVariantId: "variant-20",
      productTitle: "Peluche rouge séparée",
    });
    expect(
      variantPlan("all", {
        separatedProductIds: ["product-1" as Id<"products">],
      }),
    ).toHaveLength(1);
  });
  test("prefers media linked to the variant outside a visual group", () => {
    const task = variantPlan("all", {
      products: [
        product({
          variants,
          currentShopifyImages: [
            { url: "https://example.com/main.jpg", variantIds: [] },
            { url: "https://example.com/40.jpg", variantIds: ["variant-40"] },
          ],
        }),
      ],
    })[1];
    expect(task.sourceImageUrl).toBe("https://example.com/40.jpg");
  });
  test("regeneration retains the recorded variant even after resync changes its order", () => {
    const initial = variantPlan("all")[1];
    const regenerated = variantPlan("first", {
      products: [product({ variants: [variants[2]], title: "Renamed" })],
      restoredTarget: {
        generationTarget: initial.generationTarget,
        groupId: initial.visualGroupId,
        key: initial.visualGroupKey,
        label: initial.visualGroupLabel,
        optionValues: [],
        referenceUrls: initial.sourceImageUrls,
      },
    });
    expect(regenerated).toHaveLength(1);
    expect(regenerated[0].generationTarget).toEqual(initial.generationTarget);
    expect(regenerated[0].promptUsed).toContain("40 cm");
    expect(regenerated[0].sourceImageUrls).toEqual(initial.sourceImageUrls);
  });
});
