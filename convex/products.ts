import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";

const productGenerationStatus = v.union(
  v.literal("not_started"),
  v.literal("generating"),
  v.literal("partial"),
  v.literal("ready"),
  v.literal("pushed"),
  v.literal("canceled"),
  v.literal("failed")
);

const productFilterArgs = {
  search: v.optional(v.string()),
  productType: v.optional(v.string()),
  collection: v.optional(v.string()),
  shopifyStatus: v.optional(v.string()),
  generationStatus: v.optional(productGenerationStatus)
};

type ProductFilters = {
  search?: string;
  productType?: string;
  collection?: string;
  shopifyStatus?: string;
  generationStatus?: Doc<"products">["generationStatus"];
};

function calculateProductStatus(images: Doc<"generatedImages">[]): Doc<"products">["generationStatus"] {
  if (!images.length) return "not_started";
  if (images.some((image) => image.status === "generating" || image.status === "queued")) return "generating";
  const hasGeneratedImage = images.some(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (!hasGeneratedImage && images.some((image) => image.status === "canceled")) return "canceled";
  if (images.every((image) => image.status === "failed")) return "failed";

  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (reviewable.length) {
    const allReviewablePushed = reviewable.every((image) => image.status === "uploaded" && image.shopifyMediaId);
    if (allReviewablePushed) return "pushed";
    const anyRejected = reviewable.some((image) => image.reviewStatus === "rejected");
    if (anyRejected || images.some((image) => image.status === "failed")) return "partial";
    return "ready";
  }
  if (images.some((image) => image.status === "failed")) return "partial";
  return "not_started";
}

async function filteredProducts(ctx: { db: any }, args: ProductFilters) {
  let products: Doc<"products">[];
  if (args.productType) {
    products = await ctx.db
      .query("products")
      .withIndex("by_product_type", (q: any) => q.eq("productType", args.productType))
      .collect();
  } else {
    products = await ctx.db.query("products").collect();
  }

  const needle = (args.search ?? "").trim().toLowerCase();
  let filtered = products
    .filter((product) => {
      const matchesSearch =
        !needle ||
        product.title.toLowerCase().includes(needle) ||
        product.handle.toLowerCase().includes(needle);
      const matchesCollection =
        !args.collection ||
        product.collections.some((collection: { id?: string; title?: string; handle?: string }) => {
          return collection.id === args.collection || collection.handle === args.collection || collection.title === args.collection;
        });
      const matchesShopifyStatus = !args.shopifyStatus || product.shopifyStatus === args.shopifyStatus;
      return matchesSearch && matchesCollection && matchesShopifyStatus;
    })
    .sort((a, b) => b._creationTime - a._creationTime);

  if (args.generationStatus) {
    const productsWithStatus = await Promise.all(
      filtered.map(async (product) => {
        const images = await ctx.db
          .query("generatedImages")
          .withIndex("by_product", (q: any) => q.eq("productId", product._id))
          .collect();
        return { product, generationStatus: calculateProductStatus(images) };
      })
    );
    filtered = productsWithStatus
      .filter((item) => item.generationStatus === args.generationStatus)
      .map((item) => item.product);
  }

  return filtered;
}

export const list = query({
  args: productFilterArgs,
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const products = await filteredProducts(ctx, args);
    return Promise.all(
      products.map(async (product) => {
        const images = await ctx.db
          .query("generatedImages")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();
        return {
          ...product,
          generationStatus: calculateProductStatus(images),
          generatedImageCount: images.filter((image) => image.storageUrl).length
        };
      })
    );
  }
});

export const navigation = query({
  args: {
    productId: v.id("products"),
    ...productFilterArgs
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const products = await filteredProducts(ctx, args);
    const index = products.findIndex((product) => product._id === args.productId);
    return {
      previous: index > 0 ? products[index - 1] : null,
      next: index >= 0 && index < products.length - 1 ? products[index + 1] : null,
      position: index >= 0 ? index + 1 : null,
      total: products.length
    };
  }
});

export const facets = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const products = await ctx.db.query("products").collect();
    const productTypes = Array.from(new Set(products.map((product) => product.productType).filter(Boolean) as string[])).sort();
    const shopifyStatuses = Array.from(new Set(products.map((product) => product.shopifyStatus).filter(Boolean) as string[])).sort();
    const collections = new Map<string, { id: string; title: string; handle?: string }>();
    products.forEach((product) => {
      product.collections.forEach((collection: { id?: string; title?: string; handle?: string }) => {
        const id = collection.id ?? collection.handle ?? collection.title;
        if (id && collection.title) collections.set(id, { id, title: collection.title, handle: collection.handle });
      });
    });
    return { productTypes, shopifyStatuses, collections: Array.from(collections.values()).sort((a, b) => a.title.localeCompare(b.title)) };
  }
});

export const get = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return ctx.db.get(args.productId);
  }
});

export const internalGet = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.productId);
  }
});

export const getWithImages = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .collect();
    return { product: { ...product, generationStatus: calculateProductStatus(images) }, images };
  }
});

export const byIds = query({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const products = await Promise.all(args.productIds.map((id) => ctx.db.get(id)));
    return products.filter(Boolean) as Doc<"products">[];
  }
});

export const upsertSynced = internalMutation({
  args: {
    shopifyProductId: v.string(),
    title: v.string(),
    handle: v.string(),
    vendor: v.optional(v.union(v.string(), v.null())),
    productType: v.optional(v.union(v.string(), v.null())),
    shopifyStatus: v.optional(v.union(v.string(), v.null())),
    tags: v.array(v.string()),
    collections: v.array(v.any()),
    options: v.array(v.any()),
    variants: v.array(v.any()),
    metafields: v.array(v.any()),
    featuredImageUrl: v.optional(v.union(v.string(), v.null())),
    currentShopifyImages: v.array(v.any())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("products")
      .withIndex("by_shopify_product_id", (q) => q.eq("shopifyProductId", args.shopifyProductId))
      .unique();
    const payload = {
      ...args,
      generationStatus: existing?.generationStatus ?? ("not_started" as const),
      lastSyncedAt: now,
      updatedAt: now
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("products", { ...payload, createdAt: now });
  }
});

export const setVibe = internalMutation({
  args: {
    productId: v.id("products"),
    vibe: v.string(),
    costUsd: v.number()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      vibe: args.vibe,
      vibeCostUsd: args.costUsd,
      vibeAnalyzedAt: Date.now(),
      updatedAt: Date.now()
    });
  }
});

export const updateGenerationStatus = internalMutation({
  args: {
    productId: v.id("products"),
    generationStatus: productGenerationStatus
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      generationStatus: args.generationStatus,
      updatedAt: Date.now()
    });
  }
});

export async function recalculateProductStatus(ctx: { db: any }, productId: Id<"products">) {
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();
  return calculateProductStatus(images);
}
