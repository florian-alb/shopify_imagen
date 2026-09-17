import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
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

function visibleGeneratedImages(images: Doc<"generatedImages">[]) {
  return images.filter((image) => !image.retrySourceImageId);
}

async function isVisualProductFamilyMember(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  product: Doc<"products">,
) {
  if (!product.shopId) return false;
  const member = await ctx.db
    .query("visualProductFamilyMembers")
    .withIndex("by_shop_and_shopify_product_id", (q) =>
      q
        .eq("shopId", product.shopId!)
        .eq("shopifyProductId", product.shopifyProductId),
    )
    .unique();
  return Boolean(member);
}

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

function productQueryForShop(
  ctx: Pick<QueryCtx, "db">,
  args: ProductFilters,
  shopId: Id<"shops"> | undefined,
) {
  // Workflow fields are optional on historical rows, so keep those filters in
  // productMatches until their indexes can be enabled after a verified backfill.
  if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus && args.productType) {
    const generationStatus = args.generationStatus;
    const productType = args.productType;
    return ctx.db
      .query("products")
      .withIndex("by_shop_and_generation_status_and_product_type", (q) =>
        q
          .eq("shopId", shopId)
          .eq("generationStatus", generationStatus)
          .eq("productType", productType)
      )
      .order("desc");
  }
  if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.generationStatus) {
    const generationStatus = args.generationStatus;
    return ctx.db
      .query("products")
      .withIndex("by_shop_and_generation_status", (q) =>
        q.eq("shopId", shopId).eq("generationStatus", generationStatus)
      )
      .order("desc");
  }
  if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.productType) {
    const productType = args.productType;
    return ctx.db
      .query("products")
      .withIndex("by_shop_and_product_type", (q) =>
        q.eq("shopId", shopId).eq("productType", productType)
      )
      .order("desc");
  }
  if (!args.primaryAction && !args.generationState && !args.reviewState && !args.publishState && args.shopifyStatus) {
    const shopifyStatus = args.shopifyStatus;
    return ctx.db
      .query("products")
      .withIndex("by_shop_and_shopify_status", (q) =>
        q.eq("shopId", shopId).eq("shopifyStatus", shopifyStatus)
      )
      .order("desc");
  }

  return ctx.db
    .query("products")
    .withIndex("by_shop", (q) => q.eq("shopId", shopId))
    .order("desc");
}

function productShopIds(scope: ShopScope) {
  const shopIds: Array<Id<"shops"> | undefined> = [];
  if (scope.shopId) shopIds.push(scope.shopId);
  if (scope.includeLegacy) shopIds.push(undefined);
  return shopIds;
}

async function filteredProductsForShop(
  ctx: Pick<QueryCtx, "db">,
  args: ProductFilters,
  shopId: Id<"shops"> | undefined,
  maxResults?: number,
) {
  const needle = (args.search ?? "").trim().toLowerCase();
  const filtered: Doc<"products">[] = [];

  for await (const product of productQueryForShop(ctx, args, shopId)) {
    if (await isVisualProductFamilyMember(ctx, product)) continue;
    // Workflow counters are maintained on the product write path. Recomputing
    // them here would read every generated image for every catalogue row.
    if (!productMatches(product, args, needle)) continue;
    filtered.push(product);
    if (maxResults !== undefined && filtered.length >= maxResults) break;
  }

  return filtered;
}

async function filteredProducts(
  ctx: Pick<QueryCtx, "db">,
  args: ProductFilters,
  scope: ShopScope,
  maxResults?: number,
) {
  const batches = await Promise.all(
    productShopIds(scope).map((shopId) =>
      filteredProductsForShop(ctx, args, shopId, maxResults),
    ),
  );
  const products = batches.flat();

  products.sort((a, b) => b._creationTime - a._creationTime);

  return maxResults === undefined ? products : products.slice(0, maxResults);
}

export const list = query({
  args: { ...productFilterArgs, offset: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE));
    const products = await filteredProducts(ctx, args, scope, offset + limit + 1);
    const page = products.slice(offset, offset + limit);

    return {
      page: page.map(lightProduct),
      offset,
      limit,
      hasPrevious: offset > 0,
      hasNext: products.length > offset + limit
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
    let cached: Doc<"appSettings"> | null = null;
    if (scope.shopId) {
      cached = await ctx.db
        .query("appSettings")
        .withIndex("by_shop_and_key", (q) =>
          q.eq("shopId", scope.shopId).eq("key", PRODUCT_FACETS_KEY),
        )
        .unique();
    }
    if (!cached && scope.includeLegacy) {
      cached = await ctx.db
        .query("appSettings")
        .withIndex("by_shop_and_key", (q) =>
          q.eq("shopId", undefined).eq("key", PRODUCT_FACETS_KEY),
        )
        .unique();
    }
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
    const visibleImages = visibleGeneratedImages(images);
    return {
      product: { ...product, ...calculateProductWorkflow(visibleImages) },
      images: visibleImages,
    };
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
    googleProductCategory: v.optional(v.union(v.string(), v.null())),
    googleProductCategoryDigest: v.optional(v.union(v.string(), v.null())),
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
    const rootProducts: Doc<"products">[] = [];
    for (const product of products) {
      if (!(await isVisualProductFamilyMember(ctx, product))) {
        rootProducts.push(product);
      }
    }
    const facets = buildFacets(rootProducts);
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
  return calculateProductStatus(visibleGeneratedImages(images));
}

export async function refreshProductSummary(ctx: { db: any }, productId: Id<"products">) {
  const images = await ctx.db
    .query("generatedImages")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();
  const summary = calculateProductWorkflow(visibleGeneratedImages(images));
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
    const rootProducts: Doc<"products">[] = [];
    for (const product of products) {
      await refreshProductSummary(ctx, product._id);
      await ctx.db.patch(product._id, {
        shopifyImageCount: product.currentShopifyImages.length
      });
      if (!(await isVisualProductFamilyMember(ctx, product))) {
        rootProducts.push(product);
      }
    }
    const facets = buildFacets(rootProducts);
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", PRODUCT_FACETS_KEY)).unique();
    if (existing) await ctx.db.patch(existing._id, { value: facets, updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: PRODUCT_FACETS_KEY, value: facets, updatedAt: Date.now() });
    return { products: products.length };
  }
});
