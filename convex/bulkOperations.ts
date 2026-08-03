import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUserId } from "./authz";
import { getActiveShopScope, type ShopScope } from "./shopScope";

const MAX_PAGE_SIZE = 100;

function shopIdsForScope(scope: ShopScope) {
  return [
    ...(scope.shopId ? [scope.shopId] : []),
    ...(scope.includeLegacy ? [undefined] : []),
  ] as Array<Id<"shops"> | undefined>;
}

function mirrorProgress(job: Doc<"bulkTransformJobs">) {
  if (job.rollbackStatus) {
    return {
      processed:
        (job.rolledBackItems ?? 0) +
        (job.rollbackFailedItems ?? 0) +
        (job.rollbackConflictItems ?? 0),
      total: job.rollbackTotalItems ?? job.publishedItems,
    };
  }
  if (job.status === "queued") {
    return { processed: job.seededProductCount, total: job.productIds.length };
  }
  if (
    job.status === "publishing" ||
    job.status === "completed" ||
    job.status === "partial"
  ) {
    return {
      processed:
        job.publishedItems + job.publishFailedItems + job.conflictItems,
      total: job.transformedItems,
    };
  }
  return {
    processed:
      job.transformedItems +
      job.transformFailedItems +
      job.unsupportedItems +
      job.skippedItems,
    total: job.totalItems,
  };
}

function normalizeMirror(job: Doc<"bulkTransformJobs">) {
  const progress = mirrorProgress(job);
  return {
    key: `flip_horizontal:${job._id}`,
    id: job._id,
    operation: "flip_horizontal" as const,
    status: job.status,
    productCount: job.productIds.length,
    processedItems: progress.processed,
    totalItems: progress.total,
    completedItems: job.publishedItems,
    issueItems:
      job.seedFailedProducts +
      job.transformFailedItems +
      job.publishFailedItems +
      job.conflictItems +
      job.skippedItems +
      job.unsupportedItems,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
    dismissedAt: job.dismissedAt ?? null,
    restoreStatus: job.rollbackStatus ?? null,
    restoredItems: job.rolledBackItems,
    restoreIssueItems:
      (job.rollbackFailedItems ?? 0) + (job.rollbackConflictItems ?? 0),
    details: {
      kind: "mirror" as const,
      selectedImagePositions: job.selectedImagePositions ?? null,
      transformedItems: job.transformedItems,
      publishedItems: job.publishedItems,
      error: job.error ?? null,
    },
  };
}

function normalizeReorder(job: Doc<"bulkReorderJobs">) {
  const restoring = job.restoreStatus !== undefined;
  return {
    key: `reorder_media:${job._id}`,
    id: job._id,
    operation: "reorder_media" as const,
    status: job.status,
    productCount: job.productCount,
    processedItems: restoring
      ? (job.restoredItems ?? 0) +
        (job.restoreFailedItems ?? 0) +
        (job.restoreConflictItems ?? 0)
      : job.processedItems,
    totalItems: restoring ? (job.restoreTotalItems ?? 0) : job.productCount,
    completedItems: restoring ? (job.restoredItems ?? 0) : job.completedItems,
    issueItems:
      job.skippedItems +
      job.failedItems +
      job.conflictItems +
      job.lockedItems +
      job.unavailableItems,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
    dismissedAt: job.dismissedAt ?? null,
    restoreStatus: job.restoreStatus ?? null,
    restoredItems: job.restoredItems ?? 0,
    restoreIssueItems:
      (job.restoreFailedItems ?? 0) + (job.restoreConflictItems ?? 0),
    details: {
      kind: "reorder" as const,
      firstPosition: job.firstPosition,
      secondPosition: job.secondPosition,
      skippedItems: job.skippedItems,
      lockedItems: job.lockedItems,
      unavailableItems: job.unavailableItems,
      conflictItems: job.conflictItems,
      failedItems: job.failedItems,
      error: job.error ?? null,
    },
  };
}

const operationFilterValidator = v.optional(
  v.union(
    v.literal("all"),
    v.literal("flip_horizontal"),
    v.literal("reorder_media"),
  ),
);

export const list = query({
  args: {
    cursor: v.union(
      v.null(),
      v.object({
        createdAt: v.number(),
        excludedKeys: v.array(v.string()),
      }),
    ),
    limit: v.number(),
    operation: operationFilterValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > MAX_PAGE_SIZE
    ) {
      throw new Error(
        `Bulk history page size must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
      );
    }
    if (
      args.cursor &&
      (!Number.isFinite(args.cursor.createdAt) ||
        args.cursor.excludedKeys.length > 500)
    ) {
      throw new Error("Bulk history cursor is invalid or too large.");
    }
    const scope = await getActiveShopScope(ctx, userId);
    const take = args.limit + (args.cursor?.excludedKeys.length ?? 0) + 1;
    const operation = args.operation ?? "all";
    const mirrorGroups =
      operation === "reorder_media"
        ? []
        : await Promise.all(
            shopIdsForScope(scope).map((shopId) =>
              ctx.db
                .query("bulkTransformJobs")
                .withIndex("by_shop_and_created_at", (q) => {
                  const scoped = q.eq("shopId", shopId);
                  return args.cursor
                    ? scoped.lte("createdAt", args.cursor.createdAt)
                    : scoped;
                })
                .order("desc")
                .take(take),
            ),
          );
    const reorderGroups =
      operation === "flip_horizontal"
        ? []
        : await Promise.all(
            shopIdsForScope(scope).map((shopId) =>
              ctx.db
                .query("bulkReorderJobs")
                .withIndex("by_shop_and_created_at", (q) => {
                  const scoped = q.eq("shopId", shopId);
                  return args.cursor
                    ? scoped.lte("createdAt", args.cursor.createdAt)
                    : scoped;
                })
                .order("desc")
                .take(take),
            ),
          );
    const excludedKeys = new Set(args.cursor?.excludedKeys ?? []);
    const merged = [
      ...mirrorGroups.flat().map(normalizeMirror),
      ...reorderGroups.flat().map(normalizeReorder),
    ]
      .filter(
        (entry) =>
          !args.cursor ||
          entry.createdAt !== args.cursor.createdAt ||
          !excludedKeys.has(entry.key),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const page = merged.slice(0, args.limit);
    const hasNext = merged.length > args.limit;
    const last = page.at(-1);
    const inheritedExcludedKeys =
      last && args.cursor?.createdAt === last.createdAt
        ? args.cursor.excludedKeys
        : [];
    const continueCursor =
      hasNext && last
        ? {
            createdAt: last.createdAt,
            excludedKeys: Array.from(
              new Set([
                ...inheritedExcludedKeys,
                ...page
                  .filter((entry) => entry.createdAt === last.createdAt)
                  .map((entry) => entry.key),
              ]),
            ),
          }
        : null;
    return { page, hasNext, continueCursor, limit: args.limit };
  },
});

export const hasUndismissed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const groups = await Promise.all(
      shopIdsForScope(scope).flatMap((shopId) => [
        ctx.db
          .query("bulkTransformJobs")
          .withIndex("by_shop_and_dismissed_at", (q) =>
            q.eq("shopId", shopId).eq("dismissedAt", undefined),
          )
          .first(),
        ctx.db
          .query("bulkReorderJobs")
          .withIndex("by_shop_and_dismissed_at", (q) =>
            q.eq("shopId", shopId).eq("dismissedAt", undefined),
          )
          .first(),
      ]),
    );
    return groups.some(Boolean);
  },
});
