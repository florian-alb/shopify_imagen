import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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

const PRODUCT_FACETS_KEY = "PRODUCT_FACETS";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ProductFacets = {
  productTypes: string[];
  shopifyStatuses: string[];
  collections: Array<{ id: string; title: string; handle?: string }>;
};

function calculateProductStatus(images: Doc<"generatedImages">[]): Doc<"products">["generationStatus"] {
  if (!images.length) return "not_started";
  if (images.some((image) => image.status === "generating" || image.status === "queued")) return "generating";

  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (reviewable.some((image) => (image.reviewStatus ?? "pending") === "pending")) return "partial";
  if (reviewable.some((image) => image.status === "uploaded" && image.shopifyMediaId)) return "pushed";
  if (reviewable.some((image) => (image.reviewStatus ?? "pending") === "approved")) return "ready";
  if (images.every((image) => image.status === "failed")) return "failed";
  const hasGeneratedImage = images.some(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  if (!hasGeneratedImage && images.some((image) => image.status === "canceled")) return "canceled";
  if (reviewable.length) {
    return "partial";
  }
  if (images.some((image) => image.status === "failed")) return "partial";
  return "not_started";
}

function countReviewable(images: Doc<"generatedImages">[]) {
  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  return {
    generatedImageCount: images.filter((image) => image.storageUrl).length,
    pendingReviewCount: reviewable.filter((image) => (image.reviewStatus ?? "pending") === "pending").length,
    approvedImageCount: reviewable.filter((image) => image.reviewStatus === "approved").length,
    rejectedImageCount: reviewable.filter((image) => image.reviewStatus === "rejected").length,
    latestJobId:
      images.reduce<Doc<"generatedImages"> | null>((latest, image) => {
        if (!latest) return image;
        return image.createdAt > latest.createdAt ? image : latest;
      }, null)?.jobId ?? null
  };
}

function lightProduct(product: Doc<"products">) {
  return {
    _id: product._id,
    _creationTime: product._creationTime,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    productType: product.productType,
    shopifyStatus: product.shopifyStatus,
    featuredImageUrl: product.featuredImageUrl,
    shopifyImageCount: product.shopifyImageCount ?? product.currentShopifyImages.length,
    generationStatus: product.generationStatus,
    generatedImageCount: product.generatedImageCount ?? 0,
    pendingReviewCount: product.pendingReviewCount ?? 0,
    approvedImageCount: product.approvedImageCount ?? 0,
    rejectedImageCount: product.rejectedImageCount ?? 0,
    latestJobId: product.latestJobId ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function buildFacets(products: Doc<"products">[]): ProductFacets {
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

function productMatches(product: Doc<"products">, args: ProductFilters, needle: string) {
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
}

async function filteredProducts(ctx: { db: any }, args: ProductFilters) {
  let products: Doc<"products">[];
  if (args.generationStatus && args.productType) {
    products = await ctx.db
      .query("products")
      .withIndex("by_generation_status_and_product_type", (q: any) =>
        q.eq("generationStatus", args.generationStatus).eq("productType", args.productType)
      )
      .collect();
  } else if (args.generationStatus) {
    products = await ctx.db
      .query("products")
      .withIndex("by_generation_status", (q: any) => q.eq("generationStatus", args.generationStatus))
      .collect();
  } else if (args.productType) {
    products = await ctx.db
      .query("products")
      .withIndex("by_product_type", (q: any) => q.eq("productType", args.productType))
      .collect();
  } else if (args.shopifyStatus) {
    products = await ctx.db
      .query("products")
      .withIndex("by_shopify_status", (q: any) => q.eq("shopifyStatus", args.shopifyStatus))
      .collect();
  } else {
    products = await ctx.db.query("products").withIndex("by_created").order("desc").take(250);
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

  return filtered;
}

export const list = query({
  args: { ...productFilterArgs, offset: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE));
    const needle = (args.search ?? "").trim().toLowerCase();
    let queryBuilder;
    if (args.generationStatus && args.productType) {
      const generationStatus = args.generationStatus;
      const productType = args.productType;
      queryBuilder = ctx.db
        .query("products")
        .withIndex("by_generation_status_and_product_type", (q) =>
          q.eq("generationStatus", generationStatus).eq("productType", productType)
        );
    } else if (args.generationStatus) {
      const generationStatus = args.generationStatus;
      queryBuilder = ctx.db.query("products").withIndex("by_generation_status", (q) => q.eq("generationStatus", generationStatus));
    } else if (args.productType) {
      queryBuilder = ctx.db.query("products").withIndex("by_product_type", (q) => q.eq("productType", args.productType));
    } else if (args.shopifyStatus) {
      queryBuilder = ctx.db.query("products").withIndex("by_shopify_status", (q) => q.eq("shopifyStatus", args.shopifyStatus));
    } else {
      queryBuilder = ctx.db.query("products").withIndex("by_created").order("desc");
    }

    const page: Doc<"products">[] = [];
    let matched = 0;
    for await (const product of queryBuilder) {
      if (!productMatches(product, args, needle)) continue;
      if (matched >= offset && page.length < limit + 1) page.push(product);
      matched += 1;
      if (page.length >= limit + 1) break;
    }

    return {
      page: page.slice(0, limit).map(lightProduct),
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: page.length > limit
    };
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
    const cached = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", PRODUCT_FACETS_KEY)).unique();
    return (cached?.value as ProductFacets | undefined) ?? { productTypes: [], shopifyStatuses: [], collections: [] };
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
      shopifyImageCount: args.currentShopifyImages.length,
      generationStatus: existing?.generationStatus ?? ("not_started" as const),
      lastSyncedAt: now,
      updatedAt: now
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("products", {
      ...payload,
      generatedImageCount: 0,
      pendingReviewCount: 0,
      approvedImageCount: 0,
      rejectedImageCount: 0,
      latestJobId: null,
      createdAt: now
    });
  }
});

export const refreshFacets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const facets = buildFacets(products);
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", PRODUCT_FACETS_KEY)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: facets, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("appSettings", { key: PRODUCT_FACETS_KEY, value: facets, updatedAt: Date.now() });
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

export async function refreshProductSummary(ctx: { db: any }, productId: Id<"products">) {
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();
  const summary = countReviewable(images);
  const generationStatus = calculateProductStatus(images);
  await ctx.db.patch(productId, {
    ...summary,
    generationStatus,
    updatedAt: Date.now()
  });
  return { ...summary, generationStatus };
}

export const backfillProductSummaries = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const products = await ctx.db.query("products").collect();
    for (const product of products) {
      await refreshProductSummary(ctx, product._id);
      await ctx.db.patch(product._id, {
        shopifyImageCount: product.currentShopifyImages.length
      });
    }
    const facets = buildFacets(products);
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", PRODUCT_FACETS_KEY)).unique();
    if (existing) await ctx.db.patch(existing._id, { value: facets, updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: PRODUCT_FACETS_KEY, value: facets, updatedAt: Date.now() });
    return { products: products.length };
  }
});
