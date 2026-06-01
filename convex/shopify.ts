import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";

type GraphQlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function normalizeShopDomain(domain: string) {
  const trimmed = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!trimmed) throw new Error("SHOPIFY_SHOP_DOMAIN is required.");
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

async function getAccessToken() {
  const domain = normalizeShopDomain(env("SHOPIFY_SHOP_DOMAIN"));
  const clientId = env("SHOPIFY_CLIENT_ID");
  const clientSecret = env("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required.");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string; error_description?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description ?? payload?.error ?? `Shopify token request failed with ${response.status}.`);
  }
  return payload.access_token;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>) {
  const domain = normalizeShopDomain(env("SHOPIFY_SHOP_DOMAIN"));
  const version = env("SHOPIFY_API_VERSION", "2026-04");
  const token = await getAccessToken();
  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = (await response.json().catch(() => null)) as GraphQlResponse<T> | null;
  if (!response.ok) throw new Error(`Shopify API request failed with ${response.status}.`);
  if (payload?.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  if (!payload?.data) throw new Error("Shopify API response did not include data.");
  return payload.data;
}

const PRODUCTS_QUERY = `#graphql
  query ProductsForImageStudio($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        productType
        vendor
        tags
        collections(first: 50) { nodes { id title handle } }
        featuredMedia { preview { image { url altText } } }
        options { name values }
        variants(first: 100) { nodes { id title selectedOptions { name value } } }
        metafields(first: 50) { nodes { id namespace key type value } }
        media(first: 100) {
          nodes {
            id
            alt
            mediaContentType
            preview { image { url altText } }
            ... on MediaImage { image { url altText } }
          }
        }
      }
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  query ProductForImageStudio($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      productType
      vendor
      tags
      collections(first: 50) { nodes { id title handle } }
      featuredMedia { preview { image { url altText } } }
      options { name values }
      variants(first: 100) { nodes { id title selectedOptions { name value } } }
      metafields(first: 50) { nodes { id namespace key type value } }
      media(first: 100) {
        nodes {
          id
          alt
          mediaContentType
          preview { image { url altText } }
          ... on MediaImage { image { url altText } }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MEDIA_MUTATION = `#graphql
  mutation ProductUpdateWithGeneratedMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product {
        id
        media(first: 100) {
          nodes { id alt mediaContentType preview { status } }
        }
      }
      userErrors { field message }
    }
  }
`;

const PRODUCT_DELETE_MEDIA_MUTATION = `#graphql
  mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      deletedProductImageIds
      mediaUserErrors { field message }
    }
  }
`;

type ProductsResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<any>;
  };
};

function mapImages(product: any) {
  const images = (product.media?.nodes ?? [])
    .filter((media: any) => media.mediaContentType === "IMAGE")
    .map((media: any) => ({
      id: media.id,
      mediaId: media.id,
      url: media.image?.url ?? media.preview?.image?.url ?? null,
      altText: media.image?.altText ?? media.preview?.image?.altText ?? media.alt ?? null
    }))
    .filter((image: { url: string | null }) => image.url);
  const featuredUrl = product.featuredMedia?.preview?.image?.url;
  if (featuredUrl && !images.some((image: { url: string }) => image.url === featuredUrl)) {
    images.unshift({
      id: null,
      mediaId: null,
      url: featuredUrl,
      altText: product.featuredMedia?.preview?.image?.altText ?? null
    });
  }
  return images;
}

function mapProductForUpsert(product: any) {
  const currentShopifyImages = mapImages(product);
  return {
    shopifyProductId: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    shopifyStatus: product.status ?? null,
    tags: product.tags ?? [],
    collections: product.collections?.nodes ?? [],
    options: product.options ?? [],
    variants: product.variants?.nodes ?? [],
    metafields: product.metafields?.nodes ?? [],
    featuredImageUrl: currentShopifyImages[0]?.url ?? null,
    currentShopifyImages
  };
}

export const syncProducts = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 100, 250));
    const syncedIds: Id<"products">[] = [];
    let after: string | null = null;

    while (syncedIds.length < limit) {
      const first = Math.min(50, limit - syncedIds.length);
      const data: ProductsResponse = await shopifyGraphql<ProductsResponse>(PRODUCTS_QUERY, {
        first,
        after,
        query: env("SHOPIFY_PRODUCT_QUERY", "status:active,draft,archived")
      });
      for (const product of data.products.nodes) {
        const id = await ctx.runMutation(internal.products.upsertSynced, mapProductForUpsert(product));
        syncedIds.push(id);
      }
      if (!data.products.pageInfo.hasNextPage) break;
      after = data.products.pageInfo.endCursor;
    }

    return { synced: syncedIds.length };
  }
});

export const syncProduct = action({
  args: { productId: v.id("products") },
  handler: async (ctx, args): Promise<{ productId: Id<"products"> }> => {
    await requireUserId(ctx);
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: args.productId })) as Doc<"products"> | null;
    if (!product) throw new Error("Product not found.");
    const data = await shopifyGraphql<{ product: any | null }>(PRODUCT_QUERY, { id: product.shopifyProductId });
    if (!data.product) throw new Error("Product no longer exists in Shopify.");
    const id: Id<"products"> = await ctx.runMutation(internal.products.upsertSynced, mapProductForUpsert(data.product));
    return { productId: id };
  }
});

function throwUserErrors(errors: Array<{ message: string }>, label: string) {
  if (errors.length) throw new Error(`${label}: ${errors.map((error) => error.message).join("; ")}`);
}

export const pushProductImages = action({
  args: {
    productId: v.id("products"),
    imageIds: v.optional(v.array(v.id("generatedImages"))),
    replaceExisting: v.boolean()
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const product = (await ctx.runQuery(internal.products.internalGet, { productId: args.productId })) as Doc<"products"> | null;
    if (!product) throw new Error("Product not found.");
    const allImages = (await ctx.runQuery(internal.shopify.generatedImagesForPush, { productId: args.productId })) as Doc<"generatedImages">[];
    const selected = args.imageIds?.length ? allImages.filter((image) => args.imageIds!.includes(image._id)) : allImages;
    // Allow re-pushing images already marked "uploaded" (e.g. after a WebP
    // re-generation), not just freshly "generated" ones.
    const ready = selected.filter(
      (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
    );
    if (!ready.length) throw new Error("No approved generated images are ready to push.");

    // Publish in the order defined by the prompt templates in settings/prompts,
    // so the Shopify gallery mirrors that sequence. Images whose imageType has no
    // matching template fall back to the end, ordered by their original index.
    const promptOrder = (await ctx.runQuery(internal.shopify.promptOrder, {})) as Record<string, number>;
    ready.sort((a, b) => {
      const oa = promptOrder[a.imageType] ?? Number.POSITIVE_INFINITY;
      const ob = promptOrder[b.imageType] ?? Number.POSITIVE_INFINITY;
      return oa - ob;
    });

    const mediaInputs = ready.map((image) => ({
      originalSource: image.storageUrl!,
      alt: `${product.title} - ${image.imageType}`
    }));
    const data = await shopifyGraphql<any>(PRODUCT_UPDATE_MEDIA_MUTATION, {
      product: { id: product.shopifyProductId },
      media: mediaInputs.map((item) => ({
        originalSource: item.originalSource,
        alt: item.alt,
        mediaContentType: "IMAGE"
      }))
    });
    throwUserErrors(data.productUpdate.userErrors, "Shopify product media update failed");
    const mediaNodes = data.productUpdate.product?.media.nodes ?? [];

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
        const deleted = await shopifyGraphql<any>(PRODUCT_DELETE_MEDIA_MUTATION, {
          productId: product.shopifyProductId,
          mediaIds: existingMediaIds
        });
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

// Maps each prompt template's imageType to its display/publish position so
// pushProductImages can order the Shopify gallery to match settings/prompts.
export const promptOrder = internalQuery({
  args: {},
  handler: async (ctx) => {
    const prompts = await ctx.db.query("promptTemplates").collect();
    const order: Record<string, number> = {};
    for (const prompt of prompts) {
      order[prompt.imageType] = prompt.position ?? Number.POSITIVE_INFINITY;
    }
    return order;
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
  }
});

export const markProductPushed = internalMutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      generationStatus: "pushed",
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
          await ctx.db.patch(product._id, { currentShopifyImages: remaining, updatedAt: Date.now() });
        }
      }
    }
    await ctx.db.delete(args.imageId);
  }
});

// Deletes a generated image everywhere: the Shopify media (if pushed), the R2
// object backing storageUrl, and the Convex record.
export const deleteImage = action({
  args: { imageId: v.id("generatedImages") },
  handler: async (ctx, args): Promise<{ deleted: true }> => {
    await requireUserId(ctx);
    const image = (await ctx.runQuery(internal.shopify.internalGetImage, { imageId: args.imageId })) as Doc<"generatedImages"> | null;
    if (!image) throw new Error("Image not found.");

    if (image.shopifyMediaId && image.shopifyMediaId.startsWith("gid://")) {
      const product = (await ctx.runQuery(internal.products.internalGet, { productId: image.productId })) as Doc<"products"> | null;
      if (product) {
        const deleted = await shopifyGraphql<any>(PRODUCT_DELETE_MEDIA_MUTATION, {
          productId: product.shopifyProductId,
          mediaIds: [image.shopifyMediaId]
        });
        throwUserErrors(deleted.productDeleteMedia.mediaUserErrors, "Shopify product media deletion failed");
      }
    }

    if (image.storageUrl) {
      await ctx.runAction(internal.generation.deleteFromStorage, { storageUrl: image.storageUrl });
    }

    await ctx.runMutation(internal.shopify.deleteImageRecord, { imageId: args.imageId });
    return { deleted: true };
  }
});
