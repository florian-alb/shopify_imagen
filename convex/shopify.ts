import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { refreshProductSummary } from "./products";
import { refreshJobSummary } from "./jobs";
import type { ShopifyCredentials } from "./shopScope";
import {
  fetchShopifyAuthorizationStatus,
  type ShopifyAuthorizationStatus,
} from "./shopify/authorization";
import { getAccessToken, shopifyGraphql } from "./shopify/client";
import {
  buildMediaMoves,
  sameIds,
  throwUserErrors,
} from "./shopify/media";
import { mapProductForUpsert } from "./shopify/productMapping";
import {
  PRODUCT_DELETE_MEDIA_MUTATION,
  PRODUCT_QUERY,
  PRODUCT_REORDER_MEDIA_MUTATION,
  PRODUCT_UPDATE_MEDIA_MUTATION,
  PRODUCTS_QUERY,
  SHOPIFY_JOB_QUERY,
} from "./shopify/graphql";

type ProductsResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<any>;
  };
};

const REJECTED_IMAGE_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const REJECTED_IMAGE_CLEANUP_BATCH_SIZE = 50;

const shopifyAuthorizationStatusValidator = v.object({
  shopDomain: v.string(),
  status: v.union(
    v.literal("missing"),
    v.literal("requested"),
    v.literal("granted"),
  ),
  scopes: v.object({
    missing: v.array(v.string()),
    requested: v.array(v.string()),
    granted: v.array(v.string()),
  }),
  authorizationUrl: v.union(v.string(), v.null()),
  checkedAt: v.number(),
});

export const authorizationStatus = action({
  args: { shopId: v.optional(v.id("shops")) },
  returns: shopifyAuthorizationStatusValidator,
  handler: async (ctx, args): Promise<ShopifyAuthorizationStatus> => {
    const userId = await requireUserId(ctx);
    const credentials = (await ctx.runQuery(
      internal.shops.getShopifyCredentials,
      {
        shopId: args.shopId ?? null,
        userId,
      },
    )) as ShopifyCredentials;
    return await fetchShopifyAuthorizationStatus(credentials);
  },
});

function generatedImageAssetUrls(image: Doc<"generatedImages">) {
  return Array.from(
    new Set(
      [
        image.storageUrl,
        image.generatedImageUrl,
        image.backgroundRemovalInputUrl,
        image.transparentCutoutUrl,
      ].filter((url): url is string => Boolean(url)),
    ),
  );
}

export const syncProducts = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const credentials = (await ctx.runMutation(internal.shops.ensureActiveForAction, { userId })) as ShopifyCredentials;
    const limit = Math.max(1, Math.min(args.limit ?? 100, 250));
    const syncedIds: Id<"products">[] = [];
    let after: string | null = null;

    while (syncedIds.length < limit) {
      const first = Math.min(50, limit - syncedIds.length);
      const data: ProductsResponse = await shopifyGraphql<ProductsResponse>(
        PRODUCTS_QUERY,
        {
          first,
          after,
          query: credentials.productQuery
        },
        undefined,
        credentials
      );
      for (const product of data.products.nodes) {
        const id = await ctx.runMutation(internal.products.upsertSynced, mapProductForUpsert(product, credentials));
        syncedIds.push(id);
      }
      if (!data.products.pageInfo.hasNextPage) break;
      after = data.products.pageInfo.endCursor;
    }

    await ctx.runMutation(internal.products.refreshFacets, { shopId: credentials.shopId ?? null });
    return { synced: syncedIds.length };
  }
});

export const syncProduct = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ productId: Id<"products"> }> => {
    const userId = await requireUserId(ctx);
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: args.productId })) as Doc<"products"> | null;
    if (!product) throw new Error("Product not found.");
    const credentials = (await ctx.runQuery(internal.shops.getShopifyCredentials, {
      shopId: product.shopId ?? null,
      userId
    })) as ShopifyCredentials;
    const data = await shopifyGraphql<{ product: any | null }>(
      PRODUCT_QUERY,
      { id: product.shopifyProductId },
      undefined,
      credentials
    );
    if (!data.product) throw new Error("Product no longer exists in Shopify.");
    const id: Id<"products"> = await ctx.runMutation(
      internal.products.upsertSynced,
      mapProductForUpsert(data.product, credentials)
    );
    await ctx.runMutation(internal.products.refreshFacets, { shopId: credentials.shopId ?? null });
    return { productId: id };
  }
});

async function waitForShopifyJob(jobId: string, accessToken: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const data = await shopifyGraphql<{ job: { done: boolean } | null }>(SHOPIFY_JOB_QUERY, { id: jobId }, accessToken);
    if (data.job?.done) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// Reorders the existing Shopify gallery immediately after a drag-and-drop. The
// Shopify mutation accepts sequential moves rather than a final array, and may
// include non-image media, so the target keeps those entries in their slots.
export const reorderProductImages = action({
  args: {
    productId: v.id("products"),
    orderedMediaIds: v.array(v.string())
  },
  handler: async (ctx, args): Promise<{ reordered: number; pending: boolean }> => {
    const userId = await requireUserId(ctx);
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: args.productId })) as Doc<"products"> | null;
    if (!product) throw new Error("Product not found.");

    const credentials = (await ctx.runQuery(internal.shops.getShopifyCredentials, {
      shopId: product.shopId ?? null,
      userId
    })) as ShopifyCredentials;
    const accessToken = await getAccessToken(credentials);
    const before = await shopifyGraphql<{ product: any | null }>(
      PRODUCT_QUERY,
      { id: product.shopifyProductId },
      accessToken,
      credentials
    );
    if (!before.product) throw new Error("Product no longer exists in Shopify.");
    const mediaNodes = (before.product.media?.nodes ?? []) as Array<{ id: string; mediaContentType: string }>;
    const currentImageIds = mediaNodes.filter((media) => media.mediaContentType === "IMAGE").map((media) => media.id);
    if (!sameIds(currentImageIds, args.orderedMediaIds)) {
      throw new Error("The Shopify gallery changed since the last sync. Sync the product and try again.");
    }

    const moves = buildMediaMoves(mediaNodes, args.orderedMediaIds);
    if (!moves.length) return { reordered: 0, pending: false };

    const data = await shopifyGraphql<any>(
      PRODUCT_REORDER_MEDIA_MUTATION,
      {
        id: product.shopifyProductId,
        moves
      },
      accessToken,
      credentials
    );
    throwUserErrors(data.productReorderMedia.mediaUserErrors, "Shopify product media reorder failed");

    await ctx.runMutation(internal.shopify.cacheProductImageOrder, {
      productId: product._id,
      orderedMediaIds: args.orderedMediaIds
    });

    const jobId = data.productReorderMedia.job?.id as string | undefined;
    const completed = jobId ? await waitForShopifyJob(jobId, accessToken) : true;
    if (completed) {
      const after = await shopifyGraphql<{ product: any | null }>(
        PRODUCT_QUERY,
        { id: product.shopifyProductId },
        accessToken,
        credentials
      );
      if (after.product) {
        await ctx.runMutation(internal.products.upsertSynced, mapProductForUpsert(after.product, credentials));
        await ctx.runMutation(internal.products.refreshFacets, { shopId: credentials.shopId ?? null });
      }
    }

    return { reordered: moves.length, pending: !completed };
  }
});

export const pushProductImages = action({
  args: {
    productId: v.id("products"),
    imageIds: v.optional(v.array(v.id("generatedImages"))),
    replaceExisting: v.boolean()
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: args.productId })) as Doc<"products"> | null;
    if (!product) throw new Error("Product not found.");
    const credentials = (await ctx.runQuery(internal.shops.getShopifyCredentials, {
      shopId: product.shopId ?? null,
      userId
    })) as ShopifyCredentials;
    const allImages = (await ctx.runQuery(internal.shopify.generatedImagesForPush, { productId: args.productId })) as Doc<"generatedImages">[];
    const selected = args.imageIds?.length ? allImages.filter((image) => args.imageIds!.includes(image._id)) : allImages;
    // Allow re-pushing images already marked "uploaded" (e.g. after a WebP
    // re-generation), not just freshly "generated" ones.
    const ready = selected.filter(
      (image) =>
        image.storageUrl &&
        (image.status === "generated" || image.status === "uploaded") &&
        image.reviewStatus === "approved"
    );
    if (!ready.length) throw new Error("No approved generated images are ready to push.");

    // Publish in the order defined by the prompt templates in settings/prompts,
    // so the Shopify gallery mirrors that sequence. Images whose imageType has no
    // matching template fall back to the end, ordered by their original index.
    const promptOrderEntries = (await ctx.runQuery(internal.shopify.promptOrder, {
      shopId: product.shopId ?? null
    })) as Array<{ imageType: string; position: number | null }>;
    const promptOrder = new Map(
      promptOrderEntries.map((entry) => [
        entry.imageType,
        entry.position ?? Number.POSITIVE_INFINITY
      ])
    );
    ready.sort((a, b) => {
      const oa = promptOrder.get(a.imageType) ?? Number.POSITIVE_INFINITY;
      const ob = promptOrder.get(b.imageType) ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });

    const mediaInputs = ready.map((image) => ({
      originalSource: image.storageUrl!,
      alt: `${product.title} - ${image.imageType}`
    }));
    const data = await shopifyGraphql<any>(
      PRODUCT_UPDATE_MEDIA_MUTATION,
      {
        product: { id: product.shopifyProductId },
        media: mediaInputs.map((item) => ({
          originalSource: item.originalSource,
          alt: item.alt,
          mediaContentType: "IMAGE"
        }))
      },
      undefined,
      credentials
    );
    const productUpdate = data.productUpdate;
    if (!productUpdate) throw new ConvexError("Shopify product media update failed: Shopify returned no product update payload.");
    throwUserErrors(productUpdate.userErrors, "Shopify product media update failed");
    const mediaNodes = productUpdate.product?.media?.nodes ?? [];

    for (const image of ready) {
      const alt = `${product.title} - ${image.imageType}`;
      const media = mediaNodes.find((node: any) => node.alt === alt);
      await ctx.runMutation(internal.shopify.markImagePushed, {
        imageId: image._id,
        shopifyMediaId: media?.id ?? image.storageUrl!
      });
    }

    if (args.replaceExisting) {
      const createdIds = new Set(mediaNodes.filter((node: any) => mediaInputs.some((input) => input.alt === node.alt)).map((node: any) => node.id));
      const existingMediaIds = product.currentShopifyImages
        .map((image: any) => image.mediaId ?? image.id)
        .filter(Boolean)
        .map(String)
        .filter((id: string) => !createdIds.has(id));
      if (existingMediaIds.length) {
        const deleted = await shopifyGraphql<any>(
          PRODUCT_DELETE_MEDIA_MUTATION,
          {
            productId: product.shopifyProductId,
            mediaIds: existingMediaIds
          },
          undefined,
          credentials
        );
      if (!deleted.productDeleteMedia) throw new ConvexError("Shopify product media deletion failed: Shopify returned no media deletion payload.");
      throwUserErrors(deleted.productDeleteMedia.mediaUserErrors, "Shopify product media deletion failed");
    }
    }

    await ctx.runMutation(internal.shopify.markProductPushed, { productId: product._id });
    return { pushed: ready.length, replaced: args.replaceExisting };
  }
});

export const generatedImagesForPush = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("generatedImages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
  }
});

// Lists each prompt template's imageType and display/publish position so
// pushProductImages can order the Shopify gallery to match settings/prompts.
// Do not return a Record keyed by imageType: Convex object field names must be
// ASCII, while merchants can create prompt names with accents.
export const promptOrder = internalQuery({
  args: { shopId: v.optional(v.union(v.id("shops"), v.null())) },
  handler: async (ctx, args) => {
    const prompts = (await ctx.db.query("promptTemplates").collect()).filter((prompt: Doc<"promptTemplates">) =>
      args.shopId ? prompt.shopId === args.shopId : prompt.shopId == null
    );
    return prompts.map((prompt) => ({
      imageType: prompt.imageType,
      position: prompt.position ?? null
    }));
  }
});

export const markImagePushed = internalMutation({
  args: {
    imageId: v.id("generatedImages"),
    shopifyMediaId: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, {
      status: "uploaded",
      shopifyMediaId: args.shopifyMediaId,
      updatedAt: Date.now()
    });
    const image = await ctx.db.get(args.imageId);
    if (image) {
      await refreshJobSummary(ctx, image.jobId);
      await refreshProductSummary(ctx, image.productId);
    }
  }
});

export const markProductPushed = internalMutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await refreshProductSummary(ctx, args.productId);
  }
});

export const cacheProductImageOrder = internalMutation({
  args: {
    productId: v.id("products"),
    orderedMediaIds: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return;
    const imagesById = new Map(
      product.currentShopifyImages.map((image: any) => [String(image.mediaId ?? image.id), image])
    );
    const orderedImages = args.orderedMediaIds.map((mediaId) => imagesById.get(mediaId)).filter(Boolean);
    if (orderedImages.length !== product.currentShopifyImages.length) return;
    await ctx.db.patch(product._id, {
      currentShopifyImages: orderedImages,
      featuredImageUrl: (orderedImages[0] as any)?.url ?? null,
      shopifyImageCount: orderedImages.length,
      updatedAt: Date.now()
    });
  }
});

export const internalGetImage = internalQuery({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.imageId);
  }
});

// Removes the image record and, if it was pushed to Shopify, drops the matching
// entry from the product's cached gallery so the UI reflects the deletion
// without waiting for a re-sync.
export const deleteImageRecord = internalMutation({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) return;
    if (image.shopifyMediaId) {
      const product = await ctx.db.get(image.productId);
      if (product) {
        const remaining = product.currentShopifyImages.filter(
          (entry: any) => (entry.mediaId ?? entry.id) !== image.shopifyMediaId
        );
        if (remaining.length !== product.currentShopifyImages.length) {
          await ctx.db.patch(product._id, {
            currentShopifyImages: remaining,
            featuredImageUrl: (remaining[0] as any)?.url ?? null,
            shopifyImageCount: remaining.length,
            updatedAt: Date.now()
          });
        }
      }
    }
    await ctx.db.delete(args.imageId);
    await refreshJobSummary(ctx, image.jobId);
    await refreshProductSummary(ctx, image.productId);
  }
});

export const staleRejectedImagesForCleanup = internalQuery({
  args: {
    cutoff: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.limit ?? REJECTED_IMAGE_CLEANUP_BATCH_SIZE, REJECTED_IMAGE_CLEANUP_BATCH_SIZE),
    );
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_review_status_and_reviewed_at", (q) =>
        q.eq("reviewStatus", "rejected").lte("reviewedAt", args.cutoff),
      )
      .take(limit);

    return images.filter((image) => (image.reviewedAt ?? image.updatedAt) <= args.cutoff);
  },
});

export const cleanupStaleRejectedImages = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; deleted: number; failed: number; cutoff: number }> => {
    const cutoff = Date.now() - REJECTED_IMAGE_RETENTION_MS;
    const images = (await ctx.runQuery(internal.shopify.staleRejectedImagesForCleanup, {
      cutoff,
      limit: REJECTED_IMAGE_CLEANUP_BATCH_SIZE,
    })) as Doc<"generatedImages">[];
    let deleted = 0;
    let failed = 0;

    for (const image of images) {
      try {
        if (image.reviewStatus !== "rejected" || (image.reviewedAt ?? image.updatedAt) > cutoff) {
          continue;
        }

        for (const storageUrl of generatedImageAssetUrls(image)) {
          await ctx.runAction(internal.generation.deleteFromStorage, { storageUrl });
        }

        // Retention cleanup must not delete the merchant's Shopify media.
        await ctx.runMutation(internal.shopify.deleteImageRecord, { imageId: image._id });
        deleted += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to cleanup rejected image ${image._id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (images.length === REJECTED_IMAGE_CLEANUP_BATCH_SIZE && failed === 0) {
      await ctx.scheduler.runAfter(0, internal.shopify.cleanupStaleRejectedImages, {});
    }

    return { scanned: images.length, deleted, failed, cutoff };
  },
});

// Deletes a generated image everywhere: the Shopify media (if pushed), app-owned
// generated R2 assets, and the Convex record.
export const deleteImage = action({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args): Promise<{ deleted: true }> => {
    const userId = await requireUserId(ctx);
    const image = (await ctx.runQuery(internal.shopify.internalGetImage, { imageId: args.imageId })) as Doc<"generatedImages"> | null;
    if (!image) throw new Error("Image not found.");

    if (image.shopifyMediaId && image.shopifyMediaId.startsWith("gid://")) {
      const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
      if (product) {
        const credentials = (await ctx.runQuery(internal.shops.getShopifyCredentials, {
          shopId: product.shopId ?? null,
          userId
        })) as ShopifyCredentials;
        const deleted = await shopifyGraphql<any>(
          PRODUCT_DELETE_MEDIA_MUTATION,
          {
            productId: product.shopifyProductId,
            mediaIds: [image.shopifyMediaId]
          },
          undefined,
          credentials
        );
        throwUserErrors(deleted.productDeleteMedia.mediaUserErrors, "Shopify product media deletion failed");
      }
    }

    for (const storageUrl of generatedImageAssetUrls(image)) {
      await ctx.runAction(internal.generation.deleteFromStorage, { storageUrl });
    }

    await ctx.runMutation(internal.shopify.deleteImageRecord, { imageId: args.imageId });
    return { deleted: true };
  }
});
