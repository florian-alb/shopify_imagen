import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUserId } from "./authz";
import { activeProductLocksForIds } from "./bulkTransforms";
import {
  BULK_REORDER_OPERATION,
  MAX_BULK_REORDER_PRODUCTS,
  bulkReorderJobIsTerminal,
  classifyBulkReorderOrder,
  normalizeBulkReorderPositions,
  swapBulkReorderImageIds,
} from "./bulkReorders/model";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope,
  type ShopifyCredentials,
} from "./shopScope";
import {
  fetchShopifyAuthorizationStatus,
  requireShopifyAdminScopes,
} from "./shopify/authorization";
import { getAccessToken, shopifyGraphql } from "./shopify/client";
import { PRODUCT_QUERY } from "./shopify/graphql";
import { mapProductForUpsert } from "./shopify/productMapping";
import {
  productQueryVariables,
  type GoogleFeedSyncCoordinates,
} from "./shopify/productQuery";
import {
  submitShopifyMediaReorder,
  waitForShopifyJob,
  type ShopifyMediaOrderNode,
} from "./shopify/reorder";

const WORKER_CONCURRENCY = 4;
const MAX_ITEM_ATTEMPTS = 4;
const MAX_SHOPIFY_JOB_POLL_ATTEMPTS = 40;
const MAX_SHOPIFY_VERIFICATION_ATTEMPTS = 44;
const RETRY_DELAY_MS = 1_500;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const ERROR_SAMPLE_SIZE = 8;
const ACTIVE_JOB_STATUSES = ["queued", "running", "cancelling"] as const;

type JobReadCtx = QueryCtx | MutationCtx;
type ShopifyProductPayload = {
  media?: { nodes?: unknown[] };
  [key: string]: unknown;
};

function shopIdsForScope(scope: ShopScope) {
  return [
    ...(scope.shopId ? [scope.shopId] : []),
    ...(scope.includeLegacy ? [undefined] : []),
  ] as Array<Id<"shops"> | undefined>;
}

async function jobForUser(
  ctx: JobReadCtx,
  jobId: Id<"bulkReorderJobs">,
  userId: Id<"users">,
) {
  const scope = await getActiveShopScope(ctx, userId);
  const job = await ctx.db.get(jobId);
  if (!job || !shopMatchesScope(job, scope)) return null;
  return job;
}

async function requireReorderScope(credentials: ShopifyCredentials) {
  const status = await fetchShopifyAuthorizationStatus(credentials);
  requireShopifyAdminScopes(status, ["write_products"]);
}

async function scheduleWorkers(
  ctx: MutationCtx,
  jobId: Id<"bulkReorderJobs">,
  restore = false,
) {
  for (let worker = 0; worker < WORKER_CONCURRENCY; worker += 1) {
    await ctx.scheduler.runAfter(
      0,
      restore
        ? internal.bulkReorders.processNextRestore
        : internal.bulkReorders.processNext,
      { jobId },
    );
  }
}

async function releaseProductLocks(
  ctx: MutationCtx,
  jobId: Id<"bulkReorderJobs">,
) {
  const locks = await ctx.db
    .query("bulkReorderProductLocks")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .take(MAX_BULK_REORDER_PRODUCTS + 1);
  if (locks.length > MAX_BULK_REORDER_PRODUCTS) {
    throw new Error("Bulk reorder product lock count exceeds the job limit.");
  }
  for (const lock of locks) await ctx.db.delete(lock._id);
}

async function insertProductLock(
  ctx: MutationCtx,
  job: Doc<"bulkReorderJobs">,
  productId: Id<"products">,
  now: number,
) {
  const existing = await ctx.db
    .query("bulkReorderProductLocks")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .unique();
  if (existing?.jobId === job._id) {
    await ctx.db.patch(existing._id, { updatedAt: now });
    return;
  }
  if (existing) await ctx.db.delete(existing._id);
  await ctx.db.insert("bulkReorderProductLocks", {
    ...(job.shopId ? { shopId: job.shopId } : {}),
    productId,
    jobId: job._id,
    createdAt: now,
    updatedAt: now,
  });
}

function imageMediaNodes(
  product: ShopifyProductPayload | null,
): ShopifyMediaOrderNode[] {
  return (product?.media?.nodes ?? []).filter(
    (media): media is ShopifyMediaOrderNode => {
      if (!media || typeof media !== "object") return false;
      const candidate = media as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.mediaContentType === "string"
      );
    },
  );
}

function imageIds(mediaNodes: ShopifyMediaOrderNode[]) {
  return mediaNodes
    .filter((media) => media.mediaContentType === "IMAGE")
    .map((media) => media.id);
}

async function fetchLiveProduct(
  shopifyProductId: string,
  coordinates: GoogleFeedSyncCoordinates,
  credentials: ShopifyCredentials,
  accessToken: string,
) {
  const data = await shopifyGraphql<{
    product: ShopifyProductPayload | null;
  }>(
    PRODUCT_QUERY,
    productQueryVariables(shopifyProductId, coordinates),
    accessToken,
    credentials,
  );
  return data.product;
}

async function syncLiveProduct(
  ctx: ActionCtx,
  product: ShopifyProductPayload | null,
  credentials: ShopifyCredentials,
) {
  if (!product) return;
  await ctx.runMutation(
    internal.products.upsertSynced,
    mapProductForUpsert(product, credentials),
  );
}

function finalJobStatus(job: Doc<"bulkReorderJobs">) {
  if (job.status === "cancelling") return "cancelled" as const;
  const issues =
    job.skippedItems +
    job.failedItems +
    job.conflictItems +
    job.lockedItems +
    job.unavailableItems;
  if (!issues && job.completedItems === job.productCount) {
    return "completed" as const;
  }
  if (!job.completedItems && job.failedItems && !job.skippedItems) {
    return "failed" as const;
  }
  return "partial" as const;
}

async function finishJobIfIdle(
  ctx: MutationCtx,
  job: Doc<"bulkReorderJobs">,
) {
  const [queued, running] = await Promise.all([
    ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "queued"),
      )
      .first(),
    ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "running"),
      )
      .first(),
  ]);
  if (queued || running) return false;
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: finalJobStatus(job),
    completedAt: now,
    updatedAt: now,
  });
  await releaseProductLocks(ctx, job._id);
  return true;
}

async function finishRestoreIfIdle(
  ctx: MutationCtx,
  job: Doc<"bulkReorderJobs">,
) {
  const [queued, running] = await Promise.all([
    ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_restore_status", (q) =>
        q.eq("jobId", job._id).eq("restoreStatus", "queued"),
      )
      .first(),
    ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_restore_status", (q) =>
        q.eq("jobId", job._id).eq("restoreStatus", "running"),
      )
      .first(),
  ]);
  if (queued || running) return false;
  const now = Date.now();
  const restoreStatus =
    (job.restoredItems ?? 0) === (job.restoreTotalItems ?? 0)
      ? ("completed" as const)
      : ("partial" as const);
  await ctx.db.patch(job._id, {
    restoreStatus,
    restoreCompletedAt: now,
    updatedAt: now,
  });
  await releaseProductLocks(ctx, job._id);
  return true;
}

export const start = action({
  args: {
    productIds: v.array(v.id("products")),
    operation: v.literal(BULK_REORDER_OPERATION),
    firstPosition: v.number(),
    secondPosition: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"bulkReorderJobs">> => {
    const userId = await requireUserId(ctx);
    const credentials = (await ctx.runQuery(
      internal.shops.getShopifyCredentials,
      { userId, shopId: null },
    )) as ShopifyCredentials;
    await requireReorderScope(credentials);
    return await ctx.runMutation(internal.bulkReorders.createJob, {
      userId,
      productIds: args.productIds,
      firstPosition: args.firstPosition,
      secondPosition: args.secondPosition,
    });
  },
});

export const restore = action({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args): Promise<Id<"bulkReorderJobs">> => {
    const userId = await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.bulkReorders.getJobForUser, {
      jobId: args.jobId,
      userId,
    })) as Doc<"bulkReorderJobs"> | null;
    if (!job) throw new Error("Bulk reorder job not found.");
    const credentials = (await ctx.runQuery(
      internal.shops.getShopifyCredentials,
      { userId, shopId: job.shopId ?? null },
    )) as ShopifyCredentials;
    await requireReorderScope(credentials);
    await ctx.runMutation(internal.bulkReorders.prepareRestore, {
      jobId: job._id,
      userId,
    });
    return job._id;
  },
});

export const retry = action({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args): Promise<Id<"bulkReorderJobs">> => {
    const userId = await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.bulkReorders.getJobForUser, {
      jobId: args.jobId,
      userId,
    })) as Doc<"bulkReorderJobs"> | null;
    if (!job) throw new Error("Bulk reorder job not found.");
    const credentials = (await ctx.runQuery(
      internal.shops.getShopifyCredentials,
      { userId, shopId: job.shopId ?? null },
    )) as ShopifyCredentials;
    await requireReorderScope(credentials);
    await ctx.runMutation(internal.bulkReorders.prepareRetry, {
      jobId: job._id,
      userId,
    });
    return job._id;
  },
});

export const latestUndismissed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const activeGroups = await Promise.all(
      shopIdsForScope(scope).flatMap((shopId) =>
        ACTIVE_JOB_STATUSES.map((status) =>
          ctx.db
            .query("bulkReorderJobs")
            .withIndex("by_shop_and_status", (q) =>
              q.eq("shopId", shopId).eq("status", status),
            )
            .order("desc")
            .first(),
        ),
      ),
    );
    const active = activeGroups
      .filter((job): job is Doc<"bulkReorderJobs"> => Boolean(job))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (active) return active;
    const candidates = await Promise.all(
      shopIdsForScope(scope).map((shopId) =>
        ctx.db
          .query("bulkReorderJobs")
          .withIndex("by_shop_and_dismissed_at", (q) =>
            q.eq("shopId", shopId).eq("dismissedAt", undefined),
          )
          .order("desc")
          .first(),
      ),
    );
    return (
      candidates
        .filter((job): job is Doc<"bulkReorderJobs"> => Boolean(job))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    );
  },
});

export const get = query({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) return null;
    const items = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .take(MAX_BULK_REORDER_PRODUCTS);
    const errorItems = items
      .filter(
        (item) =>
          item.status === "failed" ||
          item.status === "conflict" ||
          item.status === "skipped" ||
          item.restoreStatus === "failed" ||
          item.restoreStatus === "conflict",
      )
      .slice(0, ERROR_SAMPLE_SIZE);
    return { job, items, errorItems };
  },
});

export const dismiss = mutation({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) throw new Error("Bulk reorder job not found.");
    if (!bulkReorderJobIsTerminal(job.status)) {
      throw new Error("An active bulk operation cannot be archived.");
    }
    if (job.restoreStatus === "queued" || job.restoreStatus === "running") {
      throw new Error("An active restoration cannot be archived.");
    }
    const now = Date.now();
    await ctx.db.patch(job._id, { dismissedAt: now, updatedAt: now });
    return job._id;
  },
});

export const cancel = mutation({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) throw new Error("Bulk reorder job not found.");
    if (job.status !== "queued" && job.status !== "running") {
      throw new Error("This bulk operation can no longer be cancelled.");
    }
    const queuedItems = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "queued"),
      )
      .take(MAX_BULK_REORDER_PRODUCTS);
    const now = Date.now();
    const cancellableItems = queuedItems.filter((item) => !item.shopifyJobId);
    for (const item of cancellableItems) {
      await ctx.db.patch(item._id, {
        status: "cancelled",
        error: null,
        completedAt: now,
        updatedAt: now,
      });
    }
    const nextJob = {
      ...job,
      status: "cancelling" as const,
      processedItems: job.processedItems + cancellableItems.length,
      updatedAt: now,
    };
    await ctx.db.patch(job._id, {
      status: "cancelling",
      processedItems: nextJob.processedItems,
      updatedAt: now,
    });
    await finishJobIfIdle(ctx, nextJob);
    return job._id;
  },
});

export const getJobForUser = internalQuery({
  args: {
    jobId: v.id("bulkReorderJobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => await jobForUser(ctx, args.jobId, args.userId),
});

export const createJob = internalMutation({
  args: {
    userId: v.id("users"),
    productIds: v.array(v.id("products")),
    firstPosition: v.number(),
    secondPosition: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"bulkReorderJobs">> => {
    const productIds = Array.from(new Set(args.productIds));
    const { firstPosition, secondPosition } = normalizeBulkReorderPositions(
      args.firstPosition,
      args.secondPosition,
    );
    if (!productIds.length) throw new Error("Select at least one product.");
    if (productIds.length > MAX_BULK_REORDER_PRODUCTS) {
      throw new Error(
        `A bulk image reorder can include at most ${MAX_BULK_REORDER_PRODUCTS} products.`,
      );
    }
    const shop = await ensureActiveShop(ctx, args.userId);
    const scope = await getActiveShopScope(ctx, args.userId);
    const products = await Promise.all(productIds.map((id) => ctx.db.get(id)));
    const availableProducts = products.filter(
      (product): product is Doc<"products"> =>
        Boolean(product && shopMatchesScope(product, scope)),
    );
    const locks = await activeProductLocksForIds(
      ctx,
      scope,
      availableProducts.map((product) => product._id),
    );
    const unlockedProducts = availableProducts.filter(
      (product) => !locks.has(product._id),
    );
    const now = Date.now();
    const lockedItems = availableProducts.length - unlockedProducts.length;
    const unavailableItems = productIds.length - availableProducts.length;
    const jobId = await ctx.db.insert("bulkReorderJobs", {
      shopId: shop._id,
      createdByUserId: args.userId,
      status: "queued",
      firstPosition,
      secondPosition,
      productCount: productIds.length,
      totalItems: unlockedProducts.length,
      processedItems: lockedItems + unavailableItems,
      completedItems: 0,
      skippedItems: 0,
      failedItems: 0,
      conflictItems: 0,
      lockedItems,
      unavailableItems,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Bulk reorder job could not be created.");
    for (const product of unlockedProducts) {
      if (!product.shopId) {
        await ctx.db.patch(product._id, {
          shopId: shop._id,
          updatedAt: now,
        });
      }
      await ctx.db.insert("bulkReorderItems", {
        shopId: shop._id,
        jobId,
        productId: product._id,
        productTitle: product.title,
        shopifyProductId: product.shopifyProductId,
        status: "queued",
        attempts: 0,
        availableAt: now,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      await insertProductLock(ctx, job, product._id, now);
    }
    await scheduleWorkers(ctx, jobId);
    return jobId;
  },
});

type ClaimedItem = {
  job: Doc<"bulkReorderJobs">;
  item: Doc<"bulkReorderItems">;
};

export const claimNext = internalMutation({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args): Promise<ClaimedItem | { waitUntil: number } | null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || bulkReorderJobIsTerminal(job.status)) return null;
    if (job.status === "cancelling") {
      const now = Date.now();
      const pendingItems = await ctx.db
        .query("bulkReorderItems")
        .withIndex("by_job_and_status", (q) =>
          q.eq("jobId", job._id).eq("status", "queued"),
        )
        .take(MAX_BULK_REORDER_PRODUCTS);
      const pending = pendingItems
        .filter((item) => item.shopifyJobId)
        .sort((left, right) => left.availableAt - right.availableAt)[0];
      if (pending) {
        if (pending.availableAt > now) {
          return { waitUntil: pending.availableAt };
        }
        const nextItem = {
          ...pending,
          status: "running" as const,
          attempts: pending.attempts + 1,
          processingStartedAt: now,
          updatedAt: now,
        };
        await ctx.db.patch(pending._id, {
          status: "running",
          attempts: nextItem.attempts,
          processingStartedAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(job._id, { updatedAt: now });
        return { job: { ...job, updatedAt: now }, item: nextItem };
      }
      await finishJobIfIdle(ctx, job);
      return null;
    }
    const now = Date.now();
    const item = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_status_and_available_at", (q) =>
        q.eq("jobId", job._id).eq("status", "queued").lte("availableAt", now),
      )
      .first();
    if (!item) {
      const next = await ctx.db
        .query("bulkReorderItems")
        .withIndex("by_job_and_status_and_available_at", (q) =>
          q.eq("jobId", job._id).eq("status", "queued"),
        )
        .first();
      if (next) return { waitUntil: next.availableAt };
      await finishJobIfIdle(ctx, job);
      return null;
    }
    const nextItem = {
      ...item,
      status: "running" as const,
      attempts: item.attempts + 1,
      processingStartedAt: now,
      updatedAt: now,
    };
    const nextJob = {
      ...job,
      status: "running" as const,
      startedAt: job.startedAt ?? now,
      updatedAt: now,
    };
    await ctx.db.patch(item._id, {
      status: nextItem.status,
      attempts: nextItem.attempts,
      processingStartedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      status: nextJob.status,
      startedAt: nextJob.startedAt,
      updatedAt: now,
    });
    return { job: nextJob, item: nextItem };
  },
});

export const saveSnapshot = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    sourceImageIds: v.array(v.string()),
    targetImageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "running") return null;
    if (item.sourceImageIds && item.targetImageIds) return item;
    await ctx.db.patch(item._id, {
      sourceImageIds: args.sourceImageIds,
      targetImageIds: args.targetImageIds,
      updatedAt: Date.now(),
    });
    return { ...item, ...args };
  },
});

export const saveShopifyJob = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    shopifyJobId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "running") return false;
    await ctx.db.patch(item._id, {
      shopifyJobId: args.shopifyJobId,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const deferItem = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    delayMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "running") return false;
    const job = await ctx.db.get(item.jobId);
    if (!job || bulkReorderJobIsTerminal(job.status)) return false;
    const now = Date.now();
    if (job.status === "cancelling") {
      if (item.shopifyJobId) {
        await ctx.db.patch(item._id, {
          status: "queued",
          availableAt: now + Math.max(250, args.delayMs),
          error: args.error ?? null,
          processingStartedAt: undefined,
          updatedAt: now,
        });
        await ctx.db.patch(job._id, { updatedAt: now });
        return true;
      }
      await ctx.db.patch(item._id, {
        status: "cancelled",
        error: args.error ?? null,
        completedAt: now,
        updatedAt: now,
      });
      const nextJob = {
        ...job,
        processedItems: job.processedItems + 1,
        updatedAt: now,
      };
      await ctx.db.patch(job._id, {
        processedItems: nextJob.processedItems,
        updatedAt: now,
      });
      await finishJobIfIdle(ctx, nextJob);
      return true;
    }
    await ctx.db.patch(item._id, {
      status: "queued",
      availableAt: now + Math.max(250, args.delayMs),
      error: args.error ?? null,
      processingStartedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { updatedAt: now });
    return true;
  },
});

const outcomeValidator = v.union(
  v.literal("completed"),
  v.literal("skipped"),
  v.literal("failed"),
  v.literal("conflict"),
);

export const recordOutcome = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    outcome: outcomeValidator,
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "running") return false;
    const job = await ctx.db.get(item.jobId);
    if (!job || bulkReorderJobIsTerminal(job.status)) return false;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      status: args.outcome,
      error: args.error ?? null,
      completedAt: now,
      processingStartedAt: undefined,
      updatedAt: now,
    });
    const nextJob = {
      ...job,
      processedItems: job.processedItems + 1,
      completedItems:
        job.completedItems + (args.outcome === "completed" ? 1 : 0),
      skippedItems: job.skippedItems + (args.outcome === "skipped" ? 1 : 0),
      failedItems: job.failedItems + (args.outcome === "failed" ? 1 : 0),
      conflictItems:
        job.conflictItems + (args.outcome === "conflict" ? 1 : 0),
      updatedAt: now,
    };
    await ctx.db.patch(job._id, {
      processedItems: nextJob.processedItems,
      completedItems: nextJob.completedItems,
      skippedItems: nextJob.skippedItems,
      failedItems: nextJob.failedItems,
      conflictItems: nextJob.conflictItems,
      updatedAt: now,
    });
    await finishJobIfIdle(ctx, nextJob);
    return true;
  },
});

async function scheduleNextAction(
  ctx: ActionCtx,
  jobId: Id<"bulkReorderJobs">,
  delayMs = 0,
) {
  await ctx.scheduler.runAfter(delayMs, internal.bulkReorders.processNext, {
    jobId,
  });
}

export const processNext = internalAction({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args): Promise<null> => {
    const claimed = (await ctx.runMutation(internal.bulkReorders.claimNext, {
      jobId: args.jobId,
    })) as ClaimedItem | { waitUntil: number } | null;
    if (!claimed) return null;
    if ("waitUntil" in claimed) {
      await scheduleNextAction(
        ctx,
        args.jobId,
        Math.max(250, claimed.waitUntil - Date.now()),
      );
      return null;
    }
    const { job } = claimed;
    let { item } = claimed;
    try {
      const credentials = (await ctx.runQuery(
        internal.shops.getShopifyCredentials,
        { shopId: job.shopId ?? null, userId: job.createdByUserId },
      )) as ShopifyCredentials;
      const coordinates = (await ctx.runQuery(
        internal.googleFeed.getSyncCoordinates,
        { shopId: job.shopId ?? null },
      )) as GoogleFeedSyncCoordinates;
      const accessToken = await getAccessToken(credentials);

      if (item.shopifyJobId) {
        const done = await waitForShopifyJob({
          jobId: item.shopifyJobId,
          credentials,
          accessToken,
          attempts: 4,
        });
        if (!done) {
          if (item.attempts < MAX_SHOPIFY_JOB_POLL_ATTEMPTS) {
            await ctx.runMutation(internal.bulkReorders.deferItem, {
              itemId: item._id,
              delayMs: RETRY_DELAY_MS,
            });
          } else {
            await ctx.runMutation(internal.bulkReorders.recordOutcome, {
              itemId: item._id,
              outcome: "failed",
              error: "Le job Shopify n’a pas terminé dans le délai prévu.",
            });
          }
          await scheduleNextAction(ctx, job._id);
          return null;
        }
      }

      let liveProduct = await fetchLiveProduct(
        item.shopifyProductId,
        coordinates,
        credentials,
        accessToken,
      );
      if (!liveProduct) {
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "skipped",
          error: "Produit introuvable dans Shopify.",
        });
        await scheduleNextAction(ctx, job._id);
        return null;
      }
      let mediaNodes = imageMediaNodes(liveProduct);
      let currentImageIds = imageIds(mediaNodes);
      if (!item.sourceImageIds || !item.targetImageIds) {
        const targetImageIds = swapBulkReorderImageIds(
          currentImageIds,
          job.firstPosition,
          job.secondPosition,
        );
        if (!targetImageIds) {
          await syncLiveProduct(ctx, liveProduct, credentials);
          await ctx.runMutation(internal.bulkReorders.recordOutcome, {
            itemId: item._id,
            outcome: "skipped",
            error: `Le produit ne possède pas d’image en position ${Math.max(job.firstPosition, job.secondPosition)}.`,
          });
          await scheduleNextAction(ctx, job._id);
          return null;
        }
        item = (await ctx.runMutation(internal.bulkReorders.saveSnapshot, {
          itemId: item._id,
          sourceImageIds: currentImageIds,
          targetImageIds,
        })) as Doc<"bulkReorderItems">;
      }

      const sourceImageIds = item.sourceImageIds!;
      const targetImageIds = item.targetImageIds!;
      let classification = classifyBulkReorderOrder({
        currentImageIds,
        sourceImageIds,
        targetImageIds,
      });
      if (classification === "target") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "completed",
        });
        await scheduleNextAction(ctx, job._id);
        return null;
      }
      if (classification === "conflict") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "conflict",
          error:
            "L’ordre Shopify a changé depuis le démarrage. Aucune modification n’a été appliquée.",
        });
        await scheduleNextAction(ctx, job._id);
        return null;
      }

      if (item.shopifyJobId) {
        if (item.attempts < MAX_SHOPIFY_VERIFICATION_ATTEMPTS) {
          await ctx.runMutation(internal.bulkReorders.deferItem, {
            itemId: item._id,
            delayMs: RETRY_DELAY_MS,
            error: "Shopify n’a pas encore reflété le nouvel ordre.",
          });
        } else {
          await ctx.runMutation(internal.bulkReorders.recordOutcome, {
            itemId: item._id,
            outcome: "failed",
            error: "Shopify a terminé le job sans confirmer le nouvel ordre.",
          });
        }
        await scheduleNextAction(ctx, job._id);
        return null;
      }

      // Re-read immediately before the mutation to narrow Shopify's unavoidable
      // read/write race window and refuse every observable concurrent change.
      liveProduct = await fetchLiveProduct(
        item.shopifyProductId,
        coordinates,
        credentials,
        accessToken,
      );
      mediaNodes = imageMediaNodes(liveProduct);
      currentImageIds = imageIds(mediaNodes);
      classification = classifyBulkReorderOrder({
        currentImageIds,
        sourceImageIds,
        targetImageIds,
      });
      if (classification !== "source") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: classification === "target" ? "completed" : "conflict",
          ...(classification === "conflict"
            ? {
                error:
                  "L’ordre Shopify a changé juste avant l’écriture. Aucune modification n’a été appliquée.",
              }
            : {}),
        });
        await scheduleNextAction(ctx, job._id);
        return null;
      }

      const result = await submitShopifyMediaReorder({
        productId: item.shopifyProductId,
        mediaNodes,
        orderedImageIds: targetImageIds,
        credentials,
        accessToken,
        waitAttempts: 4,
      });
      if (result.jobId) {
        await ctx.runMutation(internal.bulkReorders.saveShopifyJob, {
          itemId: item._id,
          shopifyJobId: result.jobId,
        });
      }
      if (!result.completed) {
        await ctx.runMutation(internal.bulkReorders.deferItem, {
          itemId: item._id,
          delayMs: RETRY_DELAY_MS,
        });
        await scheduleNextAction(ctx, job._id);
        return null;
      }
      liveProduct = await fetchLiveProduct(
        item.shopifyProductId,
        coordinates,
        credentials,
        accessToken,
      );
      classification = classifyBulkReorderOrder({
        currentImageIds: imageIds(imageMediaNodes(liveProduct)),
        sourceImageIds,
        targetImageIds,
      });
      if (classification === "target") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "completed",
        });
      } else if (classification === "conflict") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "conflict",
          error:
            "Shopify a terminé le job, mais l’ordre a ensuite été modifié par une autre action.",
        });
      } else if (item.attempts < MAX_SHOPIFY_VERIFICATION_ATTEMPTS) {
        await ctx.runMutation(internal.bulkReorders.deferItem, {
          itemId: item._id,
          delayMs: RETRY_DELAY_MS,
          error: "Shopify n’a pas encore reflété le nouvel ordre.",
        });
      } else {
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "failed",
          error: "Shopify n’a pas confirmé le nouvel ordre.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (item.attempts < MAX_ITEM_ATTEMPTS) {
        await ctx.runMutation(internal.bulkReorders.deferItem, {
          itemId: item._id,
          delayMs: RETRY_DELAY_MS * item.attempts,
          error: message,
        });
      } else {
        await ctx.runMutation(internal.bulkReorders.recordOutcome, {
          itemId: item._id,
          outcome: "failed",
          error: message,
        });
      }
    }
    await scheduleNextAction(ctx, job._id);
    return null;
  },
});

export const prepareRestore = internalMutation({
  args: {
    jobId: v.id("bulkReorderJobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const job = await jobForUser(ctx, args.jobId, args.userId);
    if (!job) throw new Error("Bulk reorder job not found.");
    if (!bulkReorderJobIsTerminal(job.status) || !job.completedItems) {
      throw new Error("No completed image reorder can be restored.");
    }
    if (job.restoreStatus === "queued" || job.restoreStatus === "running") {
      throw new Error("This restoration is already running.");
    }
    const scope = await getActiveShopScope(ctx, args.userId);
    const completedItems = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "completed"),
      )
      .take(MAX_BULK_REORDER_PRODUCTS);
    const locks = await activeProductLocksForIds(
      ctx,
      scope,
      completedItems.map((item) => item.productId),
    );
    const now = Date.now();
    let conflictCount = 0;
    let queuedCount = 0;
    for (const item of completedItems) {
      if (locks.has(item.productId)) {
        conflictCount += 1;
        await ctx.db.patch(item._id, {
          restoreStatus: "conflict",
          restoreError:
            "Le produit est verrouillé par une autre opération bulk active.",
          restoreAttempts: 0,
          restoreAvailableAt: now,
          updatedAt: now,
        });
        continue;
      }
      queuedCount += 1;
      await ctx.db.patch(item._id, {
        restoreStatus: "queued",
        restoreError: null,
        restoreAttempts: 0,
        restoreAvailableAt: now,
        restoreShopifyJobId: undefined,
        restoreProcessingStartedAt: undefined,
        restoredAt: undefined,
        updatedAt: now,
      });
      await insertProductLock(ctx, job, item.productId, now);
    }
    await ctx.db.patch(job._id, {
      restoreStatus: queuedCount ? "running" : "partial",
      restoreTotalItems: completedItems.length,
      restoredItems: 0,
      restoreFailedItems: 0,
      restoreConflictItems: conflictCount,
      restoreStartedAt: now,
      restoreCompletedAt: queuedCount ? undefined : now,
      updatedAt: now,
    });
    if (queuedCount) await scheduleWorkers(ctx, job._id, true);
    return job._id;
  },
});

type ClaimedRestoreItem = {
  job: Doc<"bulkReorderJobs">;
  item: Doc<"bulkReorderItems">;
};

export const claimNextRestore = internalMutation({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (
    ctx,
    args,
  ): Promise<ClaimedRestoreItem | { waitUntil: number } | null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.restoreStatus !== "running") return null;
    const now = Date.now();
    const item = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job_and_restore_status_and_restore_available_at", (q) =>
        q
          .eq("jobId", job._id)
          .eq("restoreStatus", "queued")
          .lte("restoreAvailableAt", now),
      )
      .first();
    if (!item) {
      const next = await ctx.db
        .query("bulkReorderItems")
        .withIndex("by_job_and_restore_status_and_restore_available_at", (q) =>
          q.eq("jobId", job._id).eq("restoreStatus", "queued"),
        )
        .first();
      if (next?.restoreAvailableAt) return { waitUntil: next.restoreAvailableAt };
      await finishRestoreIfIdle(ctx, job);
      return null;
    }
    const nextItem = {
      ...item,
      restoreStatus: "running" as const,
      restoreAttempts: (item.restoreAttempts ?? 0) + 1,
      restoreProcessingStartedAt: now,
      updatedAt: now,
    };
    await ctx.db.patch(item._id, {
      restoreStatus: "running",
      restoreAttempts: nextItem.restoreAttempts,
      restoreProcessingStartedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { updatedAt: now });
    return { job: { ...job, updatedAt: now }, item: nextItem };
  },
});

export const saveRestoreShopifyJob = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    shopifyJobId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.restoreStatus !== "running") return false;
    await ctx.db.patch(item._id, {
      restoreShopifyJobId: args.shopifyJobId,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const deferRestoreItem = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    delayMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.restoreStatus !== "running") return false;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      restoreStatus: "queued",
      restoreAvailableAt: now + Math.max(250, args.delayMs),
      restoreError: args.error ?? null,
      restoreProcessingStartedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(item.jobId, { updatedAt: now });
    return true;
  },
});

const restoreOutcomeValidator = v.union(
  v.literal("restored"),
  v.literal("failed"),
  v.literal("conflict"),
);

export const recordRestoreOutcome = internalMutation({
  args: {
    itemId: v.id("bulkReorderItems"),
    outcome: restoreOutcomeValidator,
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.restoreStatus !== "running") return false;
    const job = await ctx.db.get(item.jobId);
    if (!job || job.restoreStatus !== "running") return false;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      restoreStatus: args.outcome,
      restoreError: args.error ?? null,
      restoreProcessingStartedAt: undefined,
      ...(args.outcome === "restored" ? { restoredAt: now } : {}),
      updatedAt: now,
    });
    const nextJob = {
      ...job,
      restoredItems:
        (job.restoredItems ?? 0) + (args.outcome === "restored" ? 1 : 0),
      restoreFailedItems:
        (job.restoreFailedItems ?? 0) + (args.outcome === "failed" ? 1 : 0),
      restoreConflictItems:
        (job.restoreConflictItems ?? 0) +
        (args.outcome === "conflict" ? 1 : 0),
      updatedAt: now,
    };
    await ctx.db.patch(job._id, {
      restoredItems: nextJob.restoredItems,
      restoreFailedItems: nextJob.restoreFailedItems,
      restoreConflictItems: nextJob.restoreConflictItems,
      updatedAt: now,
    });
    await finishRestoreIfIdle(ctx, nextJob);
    return true;
  },
});

async function scheduleNextRestoreAction(
  ctx: ActionCtx,
  jobId: Id<"bulkReorderJobs">,
  delayMs = 0,
) {
  await ctx.scheduler.runAfter(
    delayMs,
    internal.bulkReorders.processNextRestore,
    { jobId },
  );
}

export const processNextRestore = internalAction({
  args: { jobId: v.id("bulkReorderJobs") },
  handler: async (ctx, args): Promise<null> => {
    const claimed = (await ctx.runMutation(
      internal.bulkReorders.claimNextRestore,
      { jobId: args.jobId },
    )) as ClaimedRestoreItem | { waitUntil: number } | null;
    if (!claimed) return null;
    if ("waitUntil" in claimed) {
      await scheduleNextRestoreAction(
        ctx,
        args.jobId,
        Math.max(250, claimed.waitUntil - Date.now()),
      );
      return null;
    }
    const { job, item } = claimed;
    try {
      if (!item.sourceImageIds || !item.targetImageIds) {
        throw new Error("Le snapshot original de ce produit est indisponible.");
      }
      const credentials = (await ctx.runQuery(
        internal.shops.getShopifyCredentials,
        { shopId: job.shopId ?? null, userId: job.createdByUserId },
      )) as ShopifyCredentials;
      const coordinates = (await ctx.runQuery(
        internal.googleFeed.getSyncCoordinates,
        { shopId: job.shopId ?? null },
      )) as GoogleFeedSyncCoordinates;
      const accessToken = await getAccessToken(credentials);
      if (item.restoreShopifyJobId) {
        const done = await waitForShopifyJob({
          jobId: item.restoreShopifyJobId,
          credentials,
          accessToken,
          attempts: 4,
        });
        if (!done) {
          if (
            (item.restoreAttempts ?? 0) < MAX_SHOPIFY_JOB_POLL_ATTEMPTS
          ) {
            await ctx.runMutation(internal.bulkReorders.deferRestoreItem, {
              itemId: item._id,
              delayMs: RETRY_DELAY_MS,
            });
          } else {
            await ctx.runMutation(
              internal.bulkReorders.recordRestoreOutcome,
              {
                itemId: item._id,
                outcome: "failed",
                error:
                  "Le job Shopify de restauration n’a pas terminé dans le délai prévu.",
              },
            );
          }
          await scheduleNextRestoreAction(ctx, job._id);
          return null;
        }
      }
      let liveProduct = await fetchLiveProduct(
        item.shopifyProductId,
        coordinates,
        credentials,
        accessToken,
      );
      if (!liveProduct) {
        await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
          itemId: item._id,
          outcome: "conflict",
          error: "Produit introuvable dans Shopify.",
        });
        await scheduleNextRestoreAction(ctx, job._id);
        return null;
      }
      let mediaNodes = imageMediaNodes(liveProduct);
      let classification = classifyBulkReorderOrder({
        currentImageIds: imageIds(mediaNodes),
        sourceImageIds: item.sourceImageIds,
        targetImageIds: item.targetImageIds,
      });
      if (classification === "source") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
          itemId: item._id,
          outcome: "restored",
        });
        await scheduleNextRestoreAction(ctx, job._id);
        return null;
      }
      if (classification === "conflict") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
          itemId: item._id,
          outcome: "conflict",
          error:
            "L’ordre Shopify a changé depuis le bulk. L’ordre actuel a été conservé.",
        });
        await scheduleNextRestoreAction(ctx, job._id);
        return null;
      }
      if (item.restoreShopifyJobId) {
        if (
          (item.restoreAttempts ?? 0) < MAX_SHOPIFY_VERIFICATION_ATTEMPTS
        ) {
          await ctx.runMutation(internal.bulkReorders.deferRestoreItem, {
            itemId: item._id,
            delayMs: RETRY_DELAY_MS,
            error: "Shopify n’a pas encore reflété l’ordre original.",
          });
        } else {
          await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
            itemId: item._id,
            outcome: "failed",
            error:
              "Shopify a terminé le job sans confirmer l’ordre original.",
          });
        }
        await scheduleNextRestoreAction(ctx, job._id);
        return null;
      }
      liveProduct = await fetchLiveProduct(
        item.shopifyProductId,
        coordinates,
        credentials,
        accessToken,
      );
      mediaNodes = imageMediaNodes(liveProduct);
      classification = classifyBulkReorderOrder({
        currentImageIds: imageIds(mediaNodes),
        sourceImageIds: item.sourceImageIds,
        targetImageIds: item.targetImageIds,
      });
      if (classification !== "target") {
        await syncLiveProduct(ctx, liveProduct, credentials);
        await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
          itemId: item._id,
          outcome: classification === "source" ? "restored" : "conflict",
          ...(classification === "conflict"
            ? {
                error:
                  "L’ordre Shopify a changé juste avant la restauration. Aucune modification n’a été appliquée.",
              }
            : {}),
        });
        await scheduleNextRestoreAction(ctx, job._id);
        return null;
      }
      const result = await submitShopifyMediaReorder({
        productId: item.shopifyProductId,
        mediaNodes,
        orderedImageIds: item.sourceImageIds,
        credentials,
        accessToken,
        waitAttempts: 4,
      });
      if (result.jobId) {
        await ctx.runMutation(internal.bulkReorders.saveRestoreShopifyJob, {
          itemId: item._id,
          shopifyJobId: result.jobId,
        });
      }
      if (!result.completed) {
        await ctx.runMutation(internal.bulkReorders.deferRestoreItem, {
          itemId: item._id,
          delayMs: RETRY_DELAY_MS,
        });
      } else {
        liveProduct = await fetchLiveProduct(
          item.shopifyProductId,
          coordinates,
          credentials,
          accessToken,
        );
        classification = classifyBulkReorderOrder({
          currentImageIds: imageIds(imageMediaNodes(liveProduct)),
          sourceImageIds: item.sourceImageIds,
          targetImageIds: item.targetImageIds,
        });
        if (classification === "source") {
          await syncLiveProduct(ctx, liveProduct, credentials);
          await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
            itemId: item._id,
            outcome: "restored",
          });
        } else if (classification === "conflict") {
          await syncLiveProduct(ctx, liveProduct, credentials);
          await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
            itemId: item._id,
            outcome: "conflict",
            error:
              "Shopify a terminé la restauration, mais l’ordre a ensuite été modifié.",
          });
        } else if (
          (item.restoreAttempts ?? 0) < MAX_SHOPIFY_VERIFICATION_ATTEMPTS
        ) {
          await ctx.runMutation(internal.bulkReorders.deferRestoreItem, {
            itemId: item._id,
            delayMs: RETRY_DELAY_MS,
            error: "Shopify n’a pas encore reflété l’ordre original.",
          });
        } else {
          await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
            itemId: item._id,
            outcome: "failed",
            error: "Shopify n’a pas confirmé l’ordre original.",
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if ((item.restoreAttempts ?? 0) < MAX_ITEM_ATTEMPTS) {
        await ctx.runMutation(internal.bulkReorders.deferRestoreItem, {
          itemId: item._id,
          delayMs: RETRY_DELAY_MS * (item.restoreAttempts ?? 1),
          error: message,
        });
      } else {
        await ctx.runMutation(internal.bulkReorders.recordRestoreOutcome, {
          itemId: item._id,
          outcome: "failed",
          error: message,
        });
      }
    }
    await scheduleNextRestoreAction(ctx, job._id);
    return null;
  },
});

export const prepareRetry = internalMutation({
  args: {
    jobId: v.id("bulkReorderJobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const job = await jobForUser(ctx, args.jobId, args.userId);
    if (!job) throw new Error("Bulk reorder job not found.");
    const scope = await getActiveShopScope(ctx, args.userId);
    const retryRestore = job.restoreStatus === "partial";
    if (!retryRestore && !bulkReorderJobIsTerminal(job.status)) {
      throw new Error("Wait for the current bulk operation to finish.");
    }
    const items = await ctx.db
      .query("bulkReorderItems")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .take(MAX_BULK_REORDER_PRODUCTS);
    const candidates = retryRestore
      ? items.filter(
          (item) =>
            item.restoreStatus === "failed" ||
            item.restoreStatus === "conflict",
        )
      : items.filter(
          (item) => item.status === "failed" || item.status === "conflict",
        );
    if (!candidates.length) throw new Error("No failed products can be retried.");
    const locks = await activeProductLocksForIds(
      ctx,
      scope,
      candidates.map((item) => item.productId),
    );
    const retryable = candidates.filter((item) => !locks.has(item.productId));
    if (!retryable.length) {
      throw new Error("Every failed product is locked by another bulk operation.");
    }
    const now = Date.now();
    let failedReset = 0;
    let conflictReset = 0;
    for (const item of retryable) {
      if (retryRestore) {
        if (item.restoreStatus === "failed") failedReset += 1;
        if (item.restoreStatus === "conflict") conflictReset += 1;
        await ctx.db.patch(item._id, {
          restoreStatus: "queued",
          restoreAttempts: 0,
          restoreAvailableAt: now,
          restoreShopifyJobId: undefined,
          restoreError: null,
          restoreProcessingStartedAt: undefined,
          updatedAt: now,
        });
      } else {
        if (item.status === "failed") failedReset += 1;
        if (item.status === "conflict") conflictReset += 1;
        await ctx.db.patch(item._id, {
          status: "queued",
          attempts: 0,
          availableAt: now,
          shopifyJobId: undefined,
          error: null,
          processingStartedAt: undefined,
          completedAt: undefined,
          updatedAt: now,
        });
      }
      await insertProductLock(ctx, job, item.productId, now);
    }
    if (retryRestore) {
      await ctx.db.patch(job._id, {
        restoreStatus: "running",
        restoreFailedItems: Math.max(
          0,
          (job.restoreFailedItems ?? 0) - failedReset,
        ),
        restoreConflictItems: Math.max(
          0,
          (job.restoreConflictItems ?? 0) - conflictReset,
        ),
        restoreCompletedAt: undefined,
        updatedAt: now,
      });
      await scheduleWorkers(ctx, job._id, true);
    } else {
      await ctx.db.patch(job._id, {
        status: "queued",
        processedItems: Math.max(0, job.processedItems - retryable.length),
        failedItems: Math.max(0, job.failedItems - failedReset),
        conflictItems: Math.max(0, job.conflictItems - conflictReset),
        completedAt: undefined,
        error: null,
        updatedAt: now,
      });
      await scheduleWorkers(ctx, job._id);
    }
    return job._id;
  },
});

export const resumeStaleJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_PROCESSING_MS;
    const jobs = new Map<Id<"bulkReorderJobs">, Doc<"bulkReorderJobs">>();
    for (const status of ACTIVE_JOB_STATUSES) {
      const stale = await ctx.db
        .query("bulkReorderJobs")
        .withIndex("by_status_and_updated_at", (q) =>
          q.eq("status", status).lt("updatedAt", cutoff),
        )
        .take(10);
      for (const job of stale) jobs.set(job._id, job);
    }
    for (const job of jobs.values()) {
      const now = Date.now();
      const runningItems = await ctx.db
        .query("bulkReorderItems")
        .withIndex("by_job_and_status", (q) =>
          q.eq("jobId", job._id).eq("status", "running"),
        )
        .take(MAX_BULK_REORDER_PRODUCTS);
      let cancelledItems = 0;
      for (const item of runningItems) {
        const shouldCancel =
          job.status === "cancelling" && !item.shopifyJobId;
        if (shouldCancel) cancelledItems += 1;
        await ctx.db.patch(item._id, {
          status: shouldCancel ? "cancelled" : "queued",
          availableAt: now,
          processingStartedAt: undefined,
          updatedAt: now,
        });
      }
      await ctx.db.patch(job._id, { updatedAt: now });
      if (job.status === "cancelling") {
        await ctx.db.patch(job._id, {
          processedItems: job.processedItems + cancelledItems,
          updatedAt: now,
        });
        await finishJobIfIdle(ctx, {
          ...job,
          processedItems: job.processedItems + cancelledItems,
          updatedAt: now,
        });
        const pendingQueuedItems = await ctx.db
          .query("bulkReorderItems")
          .withIndex("by_job_and_status", (q) =>
            q.eq("jobId", job._id).eq("status", "queued"),
          )
          .take(MAX_BULK_REORDER_PRODUCTS);
        if (
          runningItems.some((item) => item.shopifyJobId) ||
          pendingQueuedItems.some((item) => item.shopifyJobId)
        ) {
          await scheduleWorkers(ctx, job._id);
        }
      } else {
        await scheduleWorkers(ctx, job._id);
      }
    }
    const staleRestores = await ctx.db
      .query("bulkReorderJobs")
      .withIndex("by_restore_status_and_updated_at", (q) =>
        q.eq("restoreStatus", "running").lt("updatedAt", cutoff),
      )
      .take(10);
    for (const job of staleRestores) {
      const now = Date.now();
      const items = await ctx.db
        .query("bulkReorderItems")
        .withIndex("by_job_and_restore_status", (q) =>
          q.eq("jobId", job._id).eq("restoreStatus", "running"),
        )
        .take(MAX_BULK_REORDER_PRODUCTS);
      for (const item of items) {
        await ctx.db.patch(item._id, {
          restoreStatus: "queued",
          restoreAvailableAt: now,
          restoreProcessingStartedAt: undefined,
          updatedAt: now,
        });
      }
      await ctx.db.patch(job._id, { updatedAt: now });
      await scheduleWorkers(ctx, job._id, true);
    }
    return jobs.size + staleRestores.length;
  },
});
