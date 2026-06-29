import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { getActiveShopScope, shopMatchesScope, type ShopScope } from "./shopScope";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PRODUCT_FACETS_KEY,
  buildFacets,
  calculateProductStatus,
  calculateProductWorkflow,
  legacyGenerationState,
  legacyPrimaryAction,
  legacyPublishState,
  legacyReviewState,
  lightProduct,
  productMatches,
  type ProductFacets,
  type ProductFilters,
} from "./products/catalog";

const productGenerationStatus = v.union(
  v.literal("not_started"),
  v.literal("generating"),
  v.literal("partial"),
  v.literal("ready"),
  v.literal("pushed"),
  v.literal("canceled"),
  v.literal("failed")
);

const productGenerationState = v.union(
  v.literal("not_started"),
  v.literal("generating"),
  v.literal("complete"),
  v.literal("incomplete"),
  v.literal("failed"),
  v.literal("canceled")
);

const productReviewState = v.union(
  v.literal("none"),
  v.literal("needs_review"),
  v.literal("partially_approved"),
  v.literal("approved"),
  v.literal("rejected")
);

const productPublishState = v.union(
  v.literal("not_ready"),
  v.literal("ready_to_push"),
  v.literal("partially_pushed"),
  v.literal("pushed")
);

const productPrimaryAction = v.union(
  v.literal("generate"),
  v.literal("wait"),
  v.literal("review"),
  v.literal("push"),
  v.literal("fix_errors"),
  v.literal("done")
);

const productFilterArgs = {
  search: v.optional(v.string()),
  productType: v.optional(v.string()),
  collection: v.optional(v.string()),
  shopifyStatus: v.optional(v.string()),
  primaryAction: v.optional(productPrimaryAction),
  generationState: v.optional(productGenerationState),
  reviewState: v.optional(productReviewState),
  publishState: v.optional(productPublishState),
  generationStatus: v.optional(productGenerationStatus)
};

async function filteredProducts(ctx: { db: any }, args: ProductFilters, scope: ShopScope) {
  let products: Doc<"products">[];
  if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus && args.productType) {
    products = await ctx.db
      .query("products")
      .withIndex("by_generation_status_and_product_type", (q: any) =>
        q.eq("generationStatus", args.generationStatus).eq("productType", args.productType)
      )
      .collect();
  } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus) {
    products = await ctx.db
      .query("products")
      .withIndex("by_generation_status", (q: any) => q.eq("generationStatus", args.generationStatus))
      .collect();
  } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.productType) {
    products = await ctx.db
      .query("products")
      .withIndex("by_product_type", (q: any) => q.eq("productType", args.productType))
      .collect();
  } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.shopifyStatus) {
    products = await ctx.db
      .query("products")
      .withIndex("by_shopify_status", (q: any) => q.eq("shopifyStatus", args.shopifyStatus))
      .collect();
  } else {
    products = await ctx.db.query("products").withIndex("by_created").order("desc").take(250);
  }

  const needle = (args.search ?? "").trim().toLowerCase();
  const filtered = products
    .filter((product) => shopMatchesScope(product, scope))
    .filter((product) => productMatches(product, args, needle))
    .sort((a, b) => b._creationTime - a._creationTime);

  return filtered;
}

export const list = query({
  args: { ...productFilterArgs, offset: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE));
    const needle = (args.search ?? "").trim().toLowerCase();
    let queryBuilder;
    if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus && args.productType) {
      const generationStatus = args.generationStatus;
      const productType = args.productType;
      queryBuilder = ctx.db
        .query("products")
        .withIndex("by_generation_status_and_product_type", (q) =>
          q.eq("generationStatus", generationStatus).eq("productType", productType)
        );
    } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus) {
      const generationStatus = args.generationStatus;
      queryBuilder = ctx.db.query("products").withIndex("by_generation_status", (q) => q.eq("generationStatus", generationStatus));
    } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.productType) {
      queryBuilder = ctx.db.query("products").withIndex("by_product_type", (q) => q.eq("productType", args.productType));
    } else if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.shopifyStatus) {
      queryBuilder = ctx.db.query("products").withIndex("by_shopify_status", (q) => q.eq("shopifyStatus", args.shopifyStatus));
    } else {
      queryBuilder = ctx.db.query("products").withIndex("by_created").order("desc");
    }

    const page: Doc<"products">[] = [];
    let matched = 0;
    for await (const product of queryBuilder) {
      if (!shopMatchesScope(product, scope)) continue;
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
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const products = await filteredProducts(ctx, args, scope);
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
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const rows = await ctx.db.query("appSettings").collect();
    const cached = rows.find((row) => row.key === PRODUCT_FACETS_KEY && shopMatchesScope(row, scope));
    return (cached?.value as ProductFacets | undefined) ?? { productTypes: [], shopifyStatuses: [], collections: [] };
  }
});

export const get = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const product = await ctx.db.get(args.productId);
    if (!product || !shopMatchesScope(product, scope)) return null;
    return product;
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
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const product = await ctx.db.get(args.productId);
    if (!product || !shopMatchesScope(product, scope)) return null;
    const images = await ctx.db
      .query("generatedImages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .collect();
    return { product: { ...product, ...calculateProductWorkflow(images) }, images };
  }
});

export const byIds = query({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const products = await Promise.all(args.productIds.map((id) => ctx.db.get(id)));
    return products.filter((product) => product && shopMatchesScope(product, scope)) as Doc<"products">[];
  }
});

export const upsertSynced = internalMutation({
  args: {
    shopId: v.optional(v.id("shops")),
    adoptLegacy: v.optional(v.boolean()),
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
    const scopedExisting = args.shopId
      ? await ctx.db
        .query("products")
        .withIndex("by_shop_and_shopify_product_id", (q) =>
          q.eq("shopId", args.shopId).eq("shopifyProductId", args.shopifyProductId)
        )
        .unique()
      : null;
    const legacyExisting =
      !scopedExisting && (!args.shopId || args.adoptLegacy)
        ? await ctx.db
          .query("products")
          .withIndex("by_shopify_product_id", (q) => q.eq("shopifyProductId", args.shopifyProductId))
          .unique()
        : null;
    const existing = scopedExisting ?? (legacyExisting?.shopId ? null : legacyExisting);
    const { adoptLegacy, ...productArgs } = args;
    const payload = {
      ...productArgs,
      shopifyImageCount: args.currentShopifyImages.length,
      generationStatus: existing?.generationStatus ?? ("not_started" as const),
      generationState: existing
        ? existing.generationState ?? legacyGenerationState(existing.generationStatus)
        : ("not_started" as const),
      reviewState: existing
        ? existing.reviewState ?? legacyReviewState(existing)
        : ("none" as const),
      publishState: existing
        ? existing.publishState ?? legacyPublishState(existing)
        : ("not_ready" as const),
      primaryAction: existing
        ? existing.primaryAction ??
          legacyPrimaryAction(
            existing.generationState ?? legacyGenerationState(existing.generationStatus),
            existing.reviewState ?? legacyReviewState(existing),
            existing.publishState ?? legacyPublishState(existing)
          )
        : ("generate" as const),
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
  args: { shopId: v.optional(v.union(v.id("shops"), v.null())) },
  handler: async (ctx, args) => {
    const shopId = args.shopId ?? undefined;
    const products = (await ctx.db.query("products").collect()).filter((product: Doc<"products">) =>
      shopId ? product.shopId === shopId : product.shopId == null
    );
    const facets = buildFacets(products);
    const existing = shopId
      ? await ctx.db
        .query("appSettings")
        .withIndex("by_shop_and_key", (q) => q.eq("shopId", shopId).eq("key", PRODUCT_FACETS_KEY))
        .unique()
      : await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", PRODUCT_FACETS_KEY)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: facets, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("appSettings", {
      shopId,
      key: PRODUCT_FACETS_KEY,
      value: facets,
      updatedAt: Date.now()
    });
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
  const summary = calculateProductWorkflow(images);
  await ctx.db.patch(productId, {
    ...summary,
    updatedAt: Date.now()
  });
  return summary;
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
