/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { v } from "convex/values";
import { api } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import schema from "../../schema";

const noProviderCall = internalAction({
  args: { jobId: v.id("generationJobs") },
  returns: v.null(),
  handler: async () => null,
});
const modules = {
  ...import.meta.glob("../../**/*.ts"),
  "../../generation.ts": async () => ({
    processJob: noProviderCall,
    submitBatch: noProviderCall,
  }),
};

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "variants.myshopify.com",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productId = await ctx.db.insert("products", {
      shopId,
      shopifyProductId: "gid://shopify/Product/1",
      title: "Peluche",
      handle: "peluche",
      tags: [],
      collections: [],
      options: [{ name: "Taille", values: ["20 cm", "40 cm"] }],
      variants: [
        {
          id: "v20",
          title: "Rouge / 20 cm",
          selectedOptions: [
            { name: "Couleur", value: "Rouge" },
            { name: "Taille", value: "20 cm" },
          ],
        },
        {
          id: "v40",
          title: "Rouge / 40 cm",
          selectedOptions: [
            { name: "Couleur", value: "Rouge" },
            { name: "Taille", value: "40 cm" },
          ],
        },
        {
          id: "blue",
          title: "Bleu",
          selectedOptions: [{ name: "Couleur", value: "Bleu" }],
        },
      ],
      metafields: [],
      currentShopifyImages: [{ url: "https://example.com/product.jpg" }],
      featuredImageUrl: "https://example.com/product.jpg",
      generationStatus: "not_started",
      createdAt: 1,
      updatedAt: 1,
    });
    return { userId, shopId, productId };
  });
  const client = t.withIdentity({ subject: ids.userId });
  const promptId = await client.mutation(api.prompts.create, {
    imageType: "Hero",
    label: "Hero",
    content: "Sized {{VARIANT_TITLE}} {{OPTION_VALUE:Taille}}",
    condition: {
      field: "option_value",
      optionName: "Taille",
      operator: "present",
    },
    alternativeContent: "Unsized {{VARIANT_TITLE}}",
  });
  return { t, client, promptId, ...ids };
}

describe("variant generation workflow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("preview and job creation agree; each image stores its branch and context", async () => {
    const { t, client, productId } = await fixture();
    const args = {
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      variantSelection: "all" as const,
    };
    const preview = await client.query(api.jobs.preview, args);
    const jobId = await client.mutation(api.jobs.create, {
      ...args,
      forceRegenerate: true,
    });
    const images = await t.run((ctx) =>
      ctx.db
        .query("generatedImages")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .take(10),
    );
    expect(preview).toEqual({
      totalImages: 3,
      separatedProductCount: 0,
      error: null,
    });
    expect(images).toHaveLength(preview.totalImages);
    expect(images.map((image) => image.promptBranch)).toEqual([
      "if_true",
      "if_true",
      "otherwise",
    ]);
    expect(
      images.map((image) => image.generationTarget?.shopifyVariantId),
    ).toEqual(["v20", "v40", "blue"]);
    const legacyPreview = await client.query(api.jobs.preview, {
      productIds: [productId],
      selectedImageTypes: ["Hero"],
    });
    expect(legacyPreview.totalImages).toBe(1);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  test("changing and removing a condition preserves the main prompt", async () => {
    const { t, client, promptId } = await fixture();
    await client.mutation(api.prompts.update, {
      promptId,
      content: "Main changed",
    });
    expect(
      (await t.run((ctx) => ctx.db.get(promptId)))?.condition,
    ).toMatchObject({ optionName: "Taille" });
    await client.mutation(api.prompts.update, {
      promptId,
      content: "Main changed",
      condition: null,
    });
    expect(await t.run((ctx) => ctx.db.get(promptId))).toMatchObject({
      content: "Main changed",
    });
    expect(
      (await t.run((ctx) => ctx.db.get(promptId)))?.condition,
    ).toBeUndefined();
    await expect(
      client.mutation(api.prompts.create, {
        imageType: "Bad",
        label: "Bad",
        content: "Main",
        condition: {
          field: "variant_title",
          operator: "contains",
          value: "cm",
        },
      }),
    ).rejects.toThrow("Sinon");
  });

  test("bulk counts use every selected image type and deduplicate products", async () => {
    const { t, client, productId } = await fixture();
    const secondProductId = await t.run(async (ctx) => {
      const { _id, _creationTime, ...product } = (await ctx.db.get(productId))!;
      void _id;
      void _creationTime;
      return ctx.db.insert("products", {
        ...product,
        shopifyProductId: "second",
        variants: product.variants.slice(0, 1),
      });
    });
    await client.mutation(api.prompts.create, {
      imageType: "Detail",
      label: "Detail",
      content: "Details",
    });
    const args = {
      productIds: [productId, secondProductId, productId],
      selectedImageTypes: ["Hero", "Detail"],
    };
    expect(
      (
        await client.query(api.jobs.preview, {
          ...args,
          variantSelection: "first",
        })
      ).totalImages,
    ).toBe(4);
    const preview = await client.query(api.jobs.preview, {
      ...args,
      variantSelection: "all",
    });
    const jobId = await client.mutation(api.jobs.create, {
      ...args,
      variantSelection: "all",
      forceRegenerate: true,
    });
    expect(preview.totalImages).toBe(8);
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({
      mode: "bulk",
      totalTasks: preview.totalImages,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  test("error retries keep the prepared prompt and supersede only the same target and type", async () => {
    const { t, client, productId, promptId } = await fixture();
    const args = {
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      variantSelection: "all" as const,
      forceRegenerate: true,
    };
    const failedJobId = await client.mutation(api.jobs.create, args);
    const newerJobId = await client.mutation(api.jobs.create, args);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const failedImage = await t.run(async (ctx) => {
      const images = await ctx.db
        .query("generatedImages")
        .withIndex("by_job", (q) => q.eq("jobId", failedJobId))
        .take(10);
      for (const [index, image] of images.entries())
        await ctx.db.patch(image._id, {
          status: index === 0 ? "failed" : "generated",
        });
      await ctx.db.patch(failedJobId, {
        status: "failed",
        failedTasks: 1,
        completedTasks: 2,
      });
      return images[0];
    });
    await client.mutation(api.prompts.update, {
      promptId,
      content: "Changed since the failure",
    });
    await client.mutation(api.jobs.retry, { jobId: failedJobId });
    expect(await t.run((ctx) => ctx.db.get(failedImage._id))).toMatchObject({
      status: "queued",
      promptUsed: failedImage.promptUsed,
      generationTarget: failedImage.generationTarget,
      promptBranch: failedImage.promptBranch,
    });
    const newerImages = await t.run((ctx) =>
      ctx.db
        .query("generatedImages")
        .withIndex("by_job", (q) => q.eq("jobId", newerJobId))
        .take(10),
    );
    expect(newerImages.map((image) => image.status)).toEqual([
      "failed",
      "queued",
      "queued",
    ]);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  test("regeneration uses the recorded variant and the current condition", async () => {
    const { t, client, promptId, productId } = await fixture();
    const jobId = await client.mutation(api.jobs.create, {
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      variantSelection: "all",
      forceRegenerate: true,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const source = await t.run(async (ctx) => {
      const images = await ctx.db
        .query("generatedImages")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .take(10);
      const image = images.find(
        (row) => row.generationTarget?.shopifyVariantId === "v40",
      )!;
      await ctx.db.patch(image._id, {
        status: "generated",
        storageUrl: "https://example.com/generated.jpg",
      });
      await ctx.db.patch(productId, { title: "Renamed", variants: [] });
      return image;
    });
    await client.mutation(api.prompts.update, {
      promptId,
      content: "20 cm branch",
      condition: {
        field: "option_value",
        optionName: "Taille",
        operator: "equals",
        value: "20 cm",
      },
      alternativeContent: "Other {{OPTION_VALUE:Taille}}",
    });
    await client.mutation(api.jobs.regenerateImage, { imageId: source._id });
    const retry = await t.run(async (ctx) => {
      const original = await ctx.db.get(source._id);
      return ctx.db.get(original!.activeRetryImageId!);
    });
    expect(retry).toMatchObject({
      generationTarget: source.generationTarget,
      promptBranch: "otherwise",
    });
    expect(retry?.promptUsed).toContain("Other 40 cm");
    expect(retry?.promptUsed).toContain("Taille: 40 cm");
    expect(retry?.sourceImageUrls).toEqual(source.sourceImageUrls);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  test("existing separated families generate once per selected sibling", async () => {
    const { t, client, productId, shopId } = await fixture();
    const groupIds = await t.run(async (ctx) => {
      const product = (await ctx.db.get(productId))!;
      const configId = await ctx.db.insert("visualGroupConfigs", {
        shopId,
        productId,
        optionNames: ["Couleur"],
        publishMode: "variant_media",
        analysisStatus: "ready",
        createdAt: 1,
        updatedAt: 1,
      });
      const familyId = await ctx.db.insert("visualProductFamilies", {
        shopId,
        sourceProductId: productId,
        sourceShopifyProductId: product.shopifyProductId,
        configId,
        createdAt: 1,
        updatedAt: 1,
      });
      const groupIds = [];
      for (const [position, color] of ["Rouge", "Bleu"].entries()) {
        const groupId = await ctx.db.insert("visualGroups", {
          shopId,
          configId,
          productId,
          key: color,
          label: color,
          optionValues: [{ name: "Couleur", value: color }],
          position,
          createdAt: 1,
          updatedAt: 1,
        });
        groupIds.push(groupId);
        await ctx.db.insert("visualProductFamilyMembers", {
          shopId,
          familyId,
          groupId,
          shopifyProductId: `sibling-${color}`,
          title: `Peluche ${color}`,
          createdAt: 1,
          updatedAt: 1,
        });
        for (const variant of product.variants) {
          if (variant.selectedOptions[0].value !== color) continue;
          await ctx.db.insert("visualGroupVariants", {
            shopId,
            configId,
            productId,
            groupId,
            shopifyVariantId: variant.id,
            title: variant.title,
            selectedOptions: variant.selectedOptions,
            createdAt: 1,
            updatedAt: 1,
          });
        }
        await ctx.db.insert("visualGroupReferences", {
          shopId,
          configId,
          productId,
          groupId,
          sourceUrl: `https://example.com/${color}.jpg`,
          referenceUrl: `https://example.com/${color}.jpg`,
          assignmentSource: "manual",
          confidence: 1,
          confirmed: true,
          position: 0,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      return groupIds;
    });
    const args = {
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      variantSelection: "all" as const,
    };
    expect(await client.query(api.jobs.preview, args)).toEqual({
      totalImages: 2,
      separatedProductCount: 1,
      error: null,
    });
    expect(
      (
        await client.query(api.jobs.preview, {
          ...args,
          visualGroupIds: [groupIds[0]],
        })
      ).totalImages,
    ).toBe(1);
    const jobId = await client.mutation(api.jobs.create, {
      ...args,
      forceRegenerate: true,
    });
    const images = await t.run((ctx) =>
      ctx.db
        .query("generatedImages")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .take(10),
    );
    expect(images.map((image) => image.generationTarget?.variantTitle)).toEqual(
      ["Rouge / 20 cm", "Bleu"],
    );
    expect(images.map((image) => image.generationTarget?.productTitle)).toEqual(
      ["Peluche Rouge", "Peluche Bleu"],
    );
    // Historical images have no target snapshot but must retain their group.
    await t.run((ctx) =>
      ctx.db.patch(images[0]._id, {
        status: "generated",
        generationTarget: undefined,
        promptBranch: undefined,
      }),
    );
    await client.mutation(api.jobs.regenerateImage, { imageId: images[0]._id });
    const historicalRetry = await t.run(async (ctx) => {
      const source = (await ctx.db.get(images[0]._id))!;
      return ctx.db.get(source.activeRetryImageId!);
    });
    expect(historicalRetry).toMatchObject({
      visualGroupId: groupIds[0],
      promptBranch: "if_true",
    });
    expect(historicalRetry?.generationTarget?.variantTitle).toBe(
      "Rouge / 20 cm",
    );
    expect(historicalRetry?.sourceImageUrls).toEqual(images[0].sourceImageUrls);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });

  test("rejects cross-shop product and group requests", async () => {
    const { t, client, productId } = await fixture();
    const outsider = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "other.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(userId, { activeShopId: shopId });
      return userId;
    });
    await expect(
      t.withIdentity({ subject: outsider }).query(api.jobs.preview, {
        productIds: [productId],
        selectedImageTypes: ["Hero"],
      }),
    ).rejects.toThrow("active shop");
    await expect(
      t.withIdentity({ subject: outsider }).mutation(api.jobs.create, {
        productIds: [productId],
        selectedImageTypes: ["Hero"],
        forceRegenerate: true,
      }),
    ).rejects.toThrow("active shop");
    await expect(
      client.query(api.jobs.preview, {
        productIds: [],
        selectedImageTypes: [],
      }),
    ).resolves.toMatchObject({ totalImages: 0 });
  });
});
