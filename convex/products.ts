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

type ProductFilters = {
  search?: string;
  productType?: string;
  collection?: string;
  shopifyStatus?: string;
  primaryAction?: Doc<"products">["primaryAction"];
  generationState?: Doc<"products">["generationState"];
  reviewState?: Doc<"products">["reviewState"];
  publishState?: Doc<"products">["publishState"];
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

function calculateProductWorkflow(images: Doc<"generatedImages">[]) {
  const totalImageCount = images.length;
  const runningImageCount = images.filter((image) => image.status === "queued" || image.status === "generating").length;
  const failedImageCount = images.filter((image) => image.status === "failed").length;
  const canceledImageCount = images.filter((image) => image.status === "canceled").length;
  const reviewable = images.filter(
    (image) => image.storageUrl && (image.status === "generated" || image.status === "uploaded")
  );
  const generatedImageCount = reviewable.length;
  const pendingReviewCount = reviewable.filter((image) => (image.reviewStatus ?? "pending") === "pending").length;
  const approvedImageCount = reviewable.filter((image) => image.reviewStatus === "approved").length;
  const rejectedImageCount = reviewable.filter((image) => image.reviewStatus === "rejected").length;
  const publishedImageCount = reviewable.filter((image) => image.status === "uploaded" && image.shopifyMediaId).length;
  const publishableImageCount = reviewable.filter(
    (image) => image.reviewStatus === "approved" && !(image.status === "uploaded" && image.shopifyMediaId)
  ).length;

  let generationState: Doc<"products">["generationState"] = "not_started";
  if (totalImageCount === 0) generationState = "not_started";
  else if (runningImageCount > 0) generationState = "generating";
  else if (generatedImageCount === 0 && failedImageCount === totalImageCount) generationState = "failed";
  else if (generatedImageCount === 0 && canceledImageCount > 0) generationState = "canceled";
  else if (failedImageCount > 0 || canceledImageCount > 0) generationState = "incomplete";
  else generationState = "complete";

  let reviewState: Doc<"products">["reviewState"] = "none";
  if (generatedImageCount === 0) reviewState = "none";
  else if (pendingReviewCount > 0 && approvedImageCount > 0) reviewState = "partially_approved";
  else if (pendingReviewCount > 0) reviewState = "needs_review";
  else if (approvedImageCount === generatedImageCount) reviewState = "approved";
  else if (rejectedImageCount === generatedImageCount) reviewState = "rejected";
  else if (approvedImageCount > 0) reviewState = "partially_approved";
  else reviewState = "rejected";

  let publishState: Doc<"products">["publishState"] = "not_ready";
  if (approvedImageCount === 0) publishState = "not_ready";
  else if (publishedImageCount > 0 && publishedImageCount >= approvedImageCount) publishState = "pushed";
  else if (publishedImageCount > 0) publishState = "partially_pushed";
  else if (publishableImageCount > 0) publishState = "ready_to_push";

  let primaryAction: Doc<"products">["primaryAction"] = "generate";
  if (generationState === "not_started") primaryAction = "generate";
  else if (generationState === "generating") primaryAction = "wait";
  else if (reviewState === "needs_review" || reviewState === "partially_approved") primaryAction = "review";
  else if (publishState === "ready_to_push" || publishState === "partially_pushed") primaryAction = "push";
  else if (generationState === "failed" || generationState === "canceled" || generationState === "incomplete") primaryAction = "fix_errors";
  else if (publishState === "pushed") primaryAction = "done";
  else if (reviewState === "rejected") primaryAction = "generate";

  return {
    generationStatus: calculateProductStatus(images),
    generationState,
    reviewState,
    publishState,
    primaryAction,
    generatedImageCount,
    failedImageCount,
    publishedImageCount,
    publishableImageCount,
    pendingReviewCount,
    approvedImageCount,
    rejectedImageCount,
    latestJobId:
      images.reduce<Doc<"generatedImages"> | null>((latest, image) => {
        if (!latest) return image;
        return image.createdAt > latest.createdAt ? image : latest;
      }, null)?.jobId ?? null
  };
}

function lightProduct(product: Doc<"products">) {
  const generationState = product.generationState ?? legacyGenerationState(product.generationStatus);
  const reviewState = product.reviewState ?? legacyReviewState(product);
  const publishState = product.publishState ?? legacyPublishState(product);
  const primaryAction = product.primaryAction ?? legacyPrimaryAction(generationState, reviewState, publishState);
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
    generationState,
    reviewState,
    publishState,
    primaryAction,
    generatedImageCount: product.generatedImageCount ?? 0,
    failedImageCount: product.failedImageCount ?? 0,
    publishedImageCount: product.publishedImageCount ?? 0,
    publishableImageCount: product.publishableImageCount ?? 0,
    pendingReviewCount: product.pendingReviewCount ?? 0,
    approvedImageCount: product.approvedImageCount ?? 0,
    rejectedImageCount: product.rejectedImageCount ?? 0,
    latestJobId: product.latestJobId ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function legacyGenerationState(status: Doc<"products">["generationStatus"]): NonNullable<Doc<"products">["generationState"]> {
  if (status === "not_started") return "not_started";
  if (status === "generating") return "generating";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  if (status === "partial") return "incomplete";
  return "complete";
}

function legacyReviewState(product: Doc<"products">): NonNullable<Doc<"products">["reviewState"]> {
  const generated = product.generatedImageCount ?? 0;
  const pending = product.pendingReviewCount ?? 0;
  const approved = product.approvedImageCount ?? 0;
  const rejected = product.rejectedImageCount ?? 0;
  if (generated === 0) return "none";
  if (pending > 0 && approved > 0) return "partially_approved";
  if (pending > 0) return "needs_review";
  if (approved === generated) return "approved";
  if (rejected === generated) return "rejected";
  if (approved > 0) return "partially_approved";
  return "rejected";
}

function legacyPublishState(product: Doc<"products">): NonNullable<Doc<"products">["publishState"]> {
  if (product.generationStatus === "pushed") return "pushed";
  if ((product.approvedImageCount ?? 0) > 0) return "ready_to_push";
  return "not_ready";
}

function legacyPrimaryAction(
  generationState: NonNullable<Doc<"products">["generationState"]>,
  reviewState: NonNullable<Doc<"products">["reviewState"]>,
  publishState: NonNullable<Doc<"products">["publishState"]>
): NonNullable<Doc<"products">["primaryAction"]> {
  if (generationState === "not_started") return "generate";
  if (generationState === "generating") return "wait";
  if (reviewState === "needs_review" || reviewState === "partially_approved") return "review";
  if (publishState === "ready_to_push" || publishState === "partially_pushed") return "push";
  if (generationState === "failed" || generationState === "canceled" || generationState === "incomplete") return "fix_errors";
  if (publishState === "pushed") return "done";
  if (reviewState === "rejected") return "generate";
  return "generate";
}

function productWorkflowFields(product: Doc<"products">) {
  const generationState = product.generationState ?? legacyGenerationState(product.generationStatus);
  const reviewState = product.reviewState ?? legacyReviewState(product);
  const publishState = product.publishState ?? legacyPublishState(product);
  const primaryAction = product.primaryAction ?? legacyPrimaryAction(generationState, reviewState, publishState);
  return { generationState, reviewState, publishState, primaryAction };
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
  const workflow = productWorkflowFields(product);
  const matchesSearch =
    !needle ||
    product.title.toLowerCase().includes(needle) ||
    product.handle.toLowerCase().includes(needle);
  const matchesProductType = !args.productType || product.productType === args.productType;
  const matchesCollection =
    !args.collection ||
    product.collections.some((collection: { id?: string; title?: string; handle?: string }) => {
      return collection.id === args.collection || collection.handle === args.collection || collection.title === args.collection;
    });
  const matchesShopifyStatus = !args.shopifyStatus || product.shopifyStatus === args.shopifyStatus;
  const matchesPrimaryAction = !args.primaryAction || workflow.primaryAction === args.primaryAction;
  const matchesGenerationState = !args.generationState || workflow.generationState === args.generationState;
  const matchesReviewState = !args.reviewState || workflow.reviewState === args.reviewState;
  const matchesPublishState = !args.publishState || workflow.publishState === args.publishState;
  const matchesGenerationStatus = !args.generationStatus || product.generationStatus === args.generationStatus;
  return (
    matchesSearch &&
    matchesProductType &&
    matchesCollection &&
    matchesShopifyStatus &&
    matchesPrimaryAction &&
    matchesGenerationState &&
    matchesReviewState &&
    matchesPublishState &&
    matchesGenerationStatus
  );
}

async function filteredProducts(ctx: { db: any }, args: ProductFilters) {
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
    .filter((product) => productMatches(product, args, needle))
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
    return { product: { ...product, ...calculateProductWorkflow(images) }, images };
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
