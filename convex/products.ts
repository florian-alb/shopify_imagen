import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";

export const list = query({
  args: {
    search: v.optional(v.string()),
    productType: v.optional(v.string()),
    collection: v.optional(v.string()),
    generationStatus: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const products = await ctx.db.query("products").order("desc").take(500);
    const needle = (args.search ?? "").trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !needle ||
        product.title.toLowerCase().includes(needle) ||
        product.handle.toLowerCase().includes(needle);
      const matchesType = !args.productType || product.productType === args.productType;
      const matchesStatus = !args.generationStatus || product.generationStatus === args.generationStatus;
      const matchesCollection =
        !args.collection ||
        product.collections.some((collection: { id?: string; title?: string; handle?: string }) => {
          return collection.id === args.collection || collection.handle === args.collection || collection.title === args.collection;
        });
      return matchesSearch && matchesType && matchesStatus && matchesCollection;
    });
  }
});

export const facets = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const products = await ctx.db.query("products").collect();
    const productTypes = Array.from(new Set(products.map((product) => product.productType).filter(Boolean) as string[])).sort();
    const collections = new Map<string, { id: string; title: string; handle?: string }>();
    products.forEach((product) => {
      product.collections.forEach((collection: { id?: string; title?: string; handle?: string }) => {
        const id = collection.id ?? collection.handle ?? collection.title;
        if (id && collection.title) collections.set(id, { id, title: collection.title, handle: collection.handle });
      });
    });
    return { productTypes, collections: Array.from(collections.values()).sort((a, b) => a.title.localeCompare(b.title)) };
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
    return { product, images };
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
    tags: v.array(v.string()),
    collections: v.array(v.any()),
    options: v.array(v.any()),
    variants: v.array(v.any()),
    metafields: v.array(v.any()),
    featuredImageUrl: v.optional(v.union(v.string(), v.null())),
    currentShopifyImages: v.array(v.any()),
    detectedFixations: v.array(v.string())
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
    generationStatus: v.union(
      v.literal("not_started"),
      v.literal("generating"),
      v.literal("partial"),
      v.literal("ready"),
      v.literal("pushed"),
      v.literal("failed")
    )
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
  if (images.some((image: Doc<"generatedImages">) => image.status === "failed")) return "partial";
  if (images.some((image: Doc<"generatedImages">) => image.status === "generating" || image.status === "queued")) return "generating";
  if (images.length > 0 && images.every((image: Doc<"generatedImages">) => image.shopifyMediaId)) return "pushed";
  if (images.length > 0 && images.every((image: Doc<"generatedImages">) => image.status === "generated" || image.status === "uploaded")) return "ready";
  return "not_started";
}
