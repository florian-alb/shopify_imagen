/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
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
      if (query.includes("query ProductPublicationMedia"))
        return {
          product: {
            media: {
              nodes: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
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

  test("returns the persisted result on a repeated publication without creating media twice", async () => {
    const { client, productId, imageIds } = await fixture();
    const args = { productId, imageIds, replaceExisting: false };
    const first = await client.action(api.shopify.pushProductImages, args);
    const callCount = graphql.mock.calls.length;
    expect(await client.action(api.shopify.pushProductImages, args)).toEqual(
      first,
    );
    expect(graphql.mock.calls).toHaveLength(callCount);
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
  });

  test("rejects a concurrent publication while the owner is awaiting Shopify", async () => {
    const { client, productId, imageIds } = await fixture();
    const original = graphql.getMockImplementation()!;
    let release!: () => void;
    let submitted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    graphql.mockImplementation(async (query, ...args) => {
      if (query === PRODUCT_UPDATE_MEDIA_MUTATION) {
        submitted();
        await gate;
      }
      return original(query, ...args);
    });
    const args = { productId, imageIds, replaceExisting: false };
    const first = client.action(api.shopify.pushProductImages, args);
    await started;
    await expect(
      client.action(api.shopify.pushProductImages, args),
    ).rejects.toThrow("déjà en cours");
    release();
    await first;
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
  });

  test("reconciles accepted media after a lost response and retries only the remaining publication work", async () => {
    const { t, client, productId, imageIds } = await fixture();
    const original = graphql.getMockImplementation()!;
    let accepted: Array<{ id: string; alt: string }> = [];
    let interrupted = false;
    graphql.mockImplementation(async (query, variables, ...rest) => {
      if (query.includes("query ProductPublicationMedia"))
        return {
          product: {
            media: {
              nodes: accepted,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      if (query === PRODUCT_UPDATE_MEDIA_MUTATION && !interrupted) {
        interrupted = true;
        accepted = (variables as { media: Array<{ alt: string }> }).media.map(
          (row, index) => ({ id: `accepted-${index}`, alt: row.alt }),
        );
        throw new Error("Connection interrupted after Shopify acceptance");
      }
      return original(query, variables, ...rest);
    });
    const args = { productId, imageIds, replaceExisting: false };
    await expect(
      client.action(api.shopify.pushProductImages, args),
    ).rejects.toThrow("interrupted");
    expect(
      await client.action(api.shopify.pushProductImages, args),
    ).toMatchObject({ pushed: 2 });
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      status: "uploaded",
      shopifyMediaId: "accepted-0",
    });
  });

  test("keeps a missing or ambiguous Shopify result uncertain and never resubmits media", async () => {
    const { client, productId, imageIds } = await fixture();
    const original = graphql.getMockImplementation()!;
    let alt = "";
    let ambiguous = false;
    graphql.mockImplementation(async (query, variables, ...rest) => {
      if (query.includes("query ProductPublicationMedia"))
        return {
          product: {
            media: {
              nodes: ambiguous
                ? [
                    { id: "a", alt },
                    { id: "b", alt },
                  ]
                : [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      if (query === PRODUCT_UPDATE_MEDIA_MUTATION) {
        alt = (variables as { media: Array<{ alt: string }> }).media[0].alt;
        throw new Error("Response lost");
      }
      return original(query, variables, ...rest);
    });
    const args = { productId, imageIds: [imageIds[0]], replaceExisting: false };
    await expect(
      client.action(api.shopify.pushProductImages, args),
    ).rejects.toThrow("Response lost");
    await expect(
      client.action(api.shopify.pushProductImages, args),
    ).rejects.toThrow("incertaine");
    ambiguous = true;
    await expect(
      client.action(api.shopify.pushProductImages, args),
    ).rejects.toThrow("incertaine");
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
  });

  test("reuses completed media when publication options change and permits a genuinely new stored output", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
      replaceVariantMedia: true,
    });
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
      replaceVariantMedia: false,
    });
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
    await t.run((ctx) =>
      ctx.db.patch(imageIds[0], {
        status: "generated",
        shopifyMediaId: null,
        storageUrl: "https://example.com/new-output.webp",
      }),
    );
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
    });
    const uploads = graphql.mock.calls.filter(
      ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
    );
    expect(uploads).toHaveLength(2);
    expect((uploads[1][1] as { media: unknown[] }).media).toHaveLength(1);
  });

  test("resumes an expired action lease and fences stale owners before media creation", async () => {
    const { t, productId } = await fixture();
    await t.mutation(internal.shopifyPublications.claim, {
      productId,
      fingerprint: "one",
      token: "old",
    });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("productPublicationAttempts")
        .withIndex("by_productId", (q) => q.eq("productId", productId))
        .unique();
      await ctx.db.patch(row!._id, { leaseExpiresAt: 0 });
    });
    expect(
      await t.mutation(internal.shopifyPublications.claim, {
        productId,
        fingerprint: "one",
        token: "new",
      }),
    ).toMatchObject({ resumed: true });
    await expect(
      t.mutation(internal.shopifyPublications.beginMedia, {
        productId,
        token: "old",
        targetProductId: "product",
        baselineMediaIds: [],
        images: [],
      }),
    ).rejects.toThrow("ownership expired");
    expect(
      await t.run((ctx) => ctx.db.query("generatedMediaPublications").take(1)),
    ).toEqual([]);
  });

  test("adopts already uploaded legacy outputs without recreating their Shopify media", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await t.run(async (ctx) => {
      for (const [index, imageId] of imageIds.entries())
        await ctx.db.patch(imageId, {
          status: "uploaded",
          shopifyMediaId: `legacy-${index}`,
          publishedShopifyProductId: "product",
        });
    });
    const original = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, ...args) => {
      if (query.includes("query ProductPublicationMedia"))
        return {
          product: {
            media: {
              nodes: imageIds.map((_, index) => ({
                id: `legacy-${index}`,
                alt: "Legacy",
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      return original(query, ...args);
    });
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
    });
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(0);
    const rows = await t.run((ctx) =>
      ctx.db.query("generatedMediaPublications").take(3),
    );
    expect(rows.map((row) => row.shopifyMediaId).sort()).toEqual([
      "legacy-0",
      "legacy-1",
    ]);
  });

  test("reuses the accepted remote file after an overwrite retouch changes an uploaded URL", async () => {
    const { t, client, productId, imageIds } = await fixture();
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
    });
    await client.mutation(internal.jobs.insertRetouchedImage, {
      sourceImageId: imageIds[0],
      storageUrl: "https://example.com/retouched.webp",
      saveMode: "overwrite",
    });
    const original = graphql.getMockImplementation()!;
    graphql.mockImplementation(async (query, ...args) => {
      if (query.includes("query ProductPublicationMedia"))
        return {
          product: {
            media: {
              nodes: [
                { id: "media-0", alt: "Retouched" },
                { id: "media-1", alt: "Other" },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      return original(query, ...args);
    });
    await client.action(api.shopify.pushProductImages, {
      productId,
      imageIds,
      replaceExisting: false,
    });
    expect(
      graphql.mock.calls.filter(
        ([query]) => query === PRODUCT_UPDATE_MEDIA_MUTATION,
      ),
    ).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(imageIds[0]))).toMatchObject({
      storageUrl: "https://example.com/retouched.webp",
      shopifyMediaId: "media-0",
      status: "uploaded",
    });
  });

  test("blocks uncertain sibling creation before another productDuplicate request", async () => {
    const { t, productId } = await fixture();
    const groupId = await t.run(async (ctx) => {
      const product = (await ctx.db.get(productId))!;
      const configId = await ctx.db.insert("visualGroupConfigs", {
        shopId: product.shopId!,
        productId,
        optionNames: [],
        publishMode: "separate_products",
        analysisStatus: "ready",
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert("visualGroups", {
        shopId: product.shopId!,
        productId,
        configId,
        label: "Rouge",
        key: "red",
        position: 0,
        optionValues: [],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await t.mutation(internal.shopifyPublications.claim, {
      productId,
      fingerprint: "sibling",
      token: "old",
    });
    await t.mutation(internal.shopifyPublications.beginSibling, {
      productId,
      token: "old",
      groupId,
    });
    await t.mutation(internal.shopifyPublications.fail, {
      productId,
      token: "old",
      error: "Response lost",
    });
    await expect(
      t.mutation(internal.shopifyPublications.claim, {
        productId,
        fingerprint: "sibling",
        token: "new",
      }),
    ).rejects.toThrow("produit séparé est incertaine");
    expect(graphql).not.toHaveBeenCalled();
  });
});
