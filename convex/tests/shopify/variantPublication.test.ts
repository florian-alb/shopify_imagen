/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { shopifyGraphql } from "../../shopify/client";
import {
  PRODUCT_UPDATE_MEDIA_MUTATION,
  PRODUCT_VARIANTS_BULK_UPDATE_MEDIA_MUTATION,
  GENERATED_MEDIA_STATUS_QUERY,
  PRODUCT_QUERY,
} from "../../shopify/graphql";

vi.mock("../../shopify/client", () => ({
  shopifyGraphql: vi.fn(),
  getAccessToken: vi.fn(),
}));
const modules = import.meta.glob("../../**/*.ts");
const graphql = vi.mocked(shopifyGraphql);

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "test.myshopify.com",
      clientId: "test",
      clientSecret: "test",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productId = await ctx.db.insert("products", {
      shopId,
      shopifyProductId: "product",
      title: "Peluche",
      handle: "peluche",
      tags: [],
      collections: [],
      options: [],
      variants: ["20", "40"].map((id) => ({
        id,
        title: `${id} cm`,
        selectedOptions: [{ name: "Taille", value: `${id} cm` }],
      })),
      metafields: [],
      currentShopifyImages: [],
      generationStatus: "ready",
      createdAt: 1,
      updatedAt: 1,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      shopId,
      productIds: [productId],
      selectedImageTypes: ["Hero"],
      forceRegenerate: true,
      status: "completed",
      mode: "single",
      totalTasks: 2,
      completedTasks: 2,
      failedTasks: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("promptTemplates", {
      shopId,
      imageType: "Hero",
      label: "Hero",
      content: "Prompt",
      defaultContent: "Prompt",
      position: 0,
      isActive: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageIds = [];
    for (const id of ["20", "40"]) {
      imageIds.push(
        await ctx.db.insert("generatedImages", {
          shopId,
          productId,
          jobId,
          imageType: "Hero",
          promptUsed: "Prompt",
          storageUrl: `https://example.com/${id}.jpg`,
          status: "generated",
          reviewStatus: "approved",
          generationTarget: {
            kind: "variant",
            key: `variant:${id}`,
            shopifyVariantId: id,
            variantTitle: `${id} cm`,
            productTitle: "Peluche",
            selectedOptions: [{ name: "Taille", value: `${id} cm` }],
          },
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { userId, productId, imageIds };
  });
  return { t, client: t.withIdentity({ subject: ids.userId }), ...ids };
}

describe("variant publication action", () => {
  beforeEach(() => {
    graphql.mockReset();
    graphql.mockImplementation(async (query, variables) => {
      if (query === PRODUCT_UPDATE_MEDIA_MUTATION) {
        const media = (variables as { media: Array<{ alt: string }> }).media;
        return {
          productUpdate: {
            userErrors: [],
            product: {
              media: {
                nodes: media.map((row, index) => ({
                  id: `media-${index}`,
                  alt: row.alt,
                })),
              },
            },
          },
        };
      }
      if (query === GENERATED_MEDIA_STATUS_QUERY) {
        return {
          nodes: (variables as { mediaIds: string[] }).mediaIds.map((id) => ({
            id,
            status: "READY",
          })),
        };
      }
      if (query === PRODUCT_VARIANTS_BULK_UPDATE_MEDIA_MUTATION)
        return { productVariantsBulkUpdate: { userErrors: [] } };
      if (query === PRODUCT_QUERY) return { product: null };
      throw new Error("Unexpected Shopify operation in publication test");
    });
  });

  test("associates each prompt-one image with its own Shopify variant", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
      replaceVariantMedia: true,
    });
    const updates = graphql.mock.calls
      .filter(
        ([query]) => query === PRODUCT_VARIANTS_BULK_UPDATE_MEDIA_MUTATION,
      )
      .map(([, variables]) => variables);
    expect(updates).toEqual([
      { productId: "product", variants: [{ id: "20", mediaId: "media-0" }] },
      { productId: "product", variants: [{ id: "40", mediaId: "media-1" }] },
    ]);
    const images = await t.run(async (ctx) =>
      Promise.all(imageIds.map((id) => ctx.db.get(id))),
    );
    expect(images.map((image) => image?.shopifyMediaId)).toEqual([
      "media-0",
      "media-1",
    ]);
  });

  test("fails before uploading when a selected target has no approved prompt-one image", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await t.run((ctx) => ctx.db.patch(imageIds[1], { imageType: "Detail" }));
    await expect(
      client.action(api.shopify.pushProductImages, {
        productId,
        imageIds,
        replaceExisting: false,
        replaceVariantMedia: true,
      }),
    ).rejects.toThrow("40 cm");
    expect(graphql).not.toHaveBeenCalled();
  });

  test("publishes an existing separated group to its sibling and shares one image across remaining sizes", async () => {
    const { t, client, productId, imageIds } = await fixture();
    const groupId = await t.run(async (ctx) => {
      const product = (await ctx.db.get(productId))!;
      const shopId = product.shopId!;
      const configId = await ctx.db.insert("visualGroupConfigs", {
        shopId,
        productId,
        optionNames: ["Couleur"],
        publishMode: "variant_media",
        analysisStatus: "ready",
        createdAt: 1,
        updatedAt: 1,
      });
      const groupId = await ctx.db.insert("visualGroups", {
        shopId,
        productId,
        configId,
        label: "Rouge",
        key: "red",
        position: 0,
        optionValues: [{ name: "Couleur", value: "Rouge" }],
        createdAt: 1,
        updatedAt: 1,
      });
      const familyId = await ctx.db.insert("visualProductFamilies", {
        shopId,
        configId,
        sourceProductId: productId,
        sourceShopifyProductId: "product",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("visualProductFamilyMembers", {
        shopId,
        familyId,
        groupId,
        shopifyProductId: "sibling-red",
        title: "Peluche Rouge",
        createdAt: 1,
        updatedAt: 1,
      });
      for (const variant of product.variants)
        await ctx.db.insert("visualGroupVariants", {
          shopId,
          productId,
          configId,
          groupId,
          shopifyVariantId: variant.id,
          title: variant.title,
          selectedOptions: variant.selectedOptions,
          createdAt: 1,
          updatedAt: 1,
        });
      const image = (await ctx.db.get(imageIds[0]))!;
      await ctx.db.patch(image._id, {
        visualGroupId: groupId,
        generationTarget: {
          ...image.generationTarget!,
          kind: "group",
          key: `group:${groupId}`,
        },
      });
      return groupId;
    });
    graphql.mockImplementationOnce(async (query) => {
      expect(query).toBe(PRODUCT_QUERY);
      return {
        product: {
          id: "sibling-red",
          title: "Peluche Rouge",
          handle: "peluche-rouge",
          media: { nodes: [] },
          variants: {
            nodes: ["child-20", "child-40"].map((id) => ({
              id,
              selectedOptions: [{ name: "Couleur", value: "Rouge" }],
            })),
          },
        },
      };
    });
    const result = await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds: [imageIds[0]],
      replaceExisting: false,
    });
    expect(result).toMatchObject({
      publishMode: "separate_products",
      pushed: 1,
      createdProducts: [{ groupId, shopifyProductId: "sibling-red" }],
    });
    const updates = graphql.mock.calls
      .filter(
        ([query]) => query === PRODUCT_VARIANTS_BULK_UPDATE_MEDIA_MUTATION,
      )
      .map(([, variables]) => variables);
    expect(updates).toEqual([
      {
        productId: "sibling-red",
        variants: [
          { id: "child-20", mediaId: "media-0" },
          { id: "child-40", mediaId: "media-0" },
        ],
      },
    ]);
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      publishedShopifyProductId: "sibling-red",
    });
  });

  test("keeps approval checks and rejects stale variant targets before uploading", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await t.run((ctx) => ctx.db.patch(productId, { variants: [] }));
    await expect(
      client.action(api.shopify.pushProductImages, {
        productId,
        imageIds,
        replaceExisting: false,
      }),
    ).rejects.toThrow("n’existe plus");
    expect(graphql).not.toHaveBeenCalled();
    await t.run(async (ctx) => {
      for (const id of imageIds)
        await ctx.db.patch(id, { reviewStatus: "pending" });
    });
    await expect(
      client.action(api.shopify.pushProductImages, {
        productId,
        imageIds,
        replaceExisting: false,
      }),
    ).rejects.toThrow("No approved");
    expect(graphql).not.toHaveBeenCalled();
  });
});
