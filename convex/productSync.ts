import { WorkflowManager, start as startWorkflow, vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUserId } from "./authz";
import { isApprovedUser } from "./userAccess";
import schema from "./schema";
import { publicSyncRun, syncStatusValidator } from "./productSyncModel";
import { applyPresenceChecks, presenceCheckValidator } from "./productSyncReconciliation";

const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 2, retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 2000, base: 2 } },
});

async function ownedActiveShop(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  const shop = user?.activeShopId ? await ctx.db.get(user.activeShopId) : null;
  if (!shop || shop.createdByUserId !== userId) throw new ConvexError("La boutique active n’est pas accessible.");
  return shop;
}

async function begin(ctx: MutationCtx, shopId: Id<"shops">): Promise<Id<"productSyncRuns">> {
  const shop = await ctx.db.get(shopId);
  const user = shop ? await ctx.db.get(shop.createdByUserId) : null;
  if (!shop || !isApprovedUser(user)) throw new ConvexError("Boutique inaccessible.");
  const existing = await ctx.db.query("productSyncRuns")
    .withIndex("by_shop_id_and_status", q => q.eq("shopId", shopId).eq("status", "running")).first();
  if (existing) return existing._id;
  const now = Date.now();
  const runId = await ctx.db.insert("productSyncRuns", {
    shopId, createdByUserId: shop.createdByUserId, status: "running", phase: "syncing",
    productQuery: shop.productQuery ?? "status:active,draft,archived",
    syncCursor: null, reconcileCursor: null, synced: 0, checked: 0, removed: 0, startedAt: now, updatedAt: now,
  });
  const workflowId = await startWorkflow(ctx, internal.productSync.fullSync, { runId }, {
    startAsync: true, onComplete: internal.productSync.completed, context: { runId },
  });
  await ctx.db.patch(runId, { workflowId });
  return runId;
}

export const start = mutation({
  args: {}, returns: v.id("productSyncRuns"),
  handler: async (ctx): Promise<Id<"productSyncRuns">> => begin(ctx, (await ownedActiveShop(ctx))._id),
});

// Operator-only entry point: the internal function derives the owner from the
// explicitly named shop; no fabricated browser identity or public userId arg.
export const startForShop = internalMutation({
  args: { shopId: v.id("shops") }, returns: v.id("productSyncRuns"),
  handler: async (ctx, args): Promise<Id<"productSyncRuns">> => begin(ctx, args.shopId),
});

export const current = query({
  args: {}, returns: v.union(syncStatusValidator, v.null()),
  handler: async (ctx) => {
    const shop = await ownedActiveShop(ctx);
    const run = await ctx.db.query("productSyncRuns")
      .withIndex("by_shop_id_and_started_at", q => q.eq("shopId", shop._id)).order("desc").first();
    return run ? publicSyncRun(run) : null;
  },
});

export const status = query({
  args: { runId: v.id("productSyncRuns") }, returns: v.union(syncStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const shop = await ownedActiveShop(ctx);
    const run = await ctx.db.get(args.runId);
    return run?.shopId === shop._id && run.createdByUserId === shop.createdByUserId ? publicSyncRun(run) : null;
  },
});

export const getRun = internalQuery({
  args: { runId: v.id("productSyncRuns") },
  returns: v.union(schema.tables.productSyncRuns.validator.extend({ _id: v.id("productSyncRuns"), _creationTime: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const shop = await ctx.db.get(run.shopId);
    const user = await ctx.db.get(run.createdByUserId);
    if (!shop || shop.createdByUserId !== run.createdByUserId || !isApprovedUser(user))
      throw new ConvexError("La boutique de synchronisation n’est plus accessible.");
    return run;
  },
});

export const commitScanPage = internalMutation({
  args: { runId: v.id("productSyncRuns"), cursor: v.union(v.string(), v.null()),
    nextCursor: v.union(v.string(), v.null()), done: v.boolean(), count: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status !== "running" || run.phase !== "syncing" || run.syncCursor !== args.cursor) return null;
    await ctx.db.patch(run._id, { syncCursor: args.nextCursor, phase: args.done ? "reconciling" : "syncing",
      synced: run.synced + args.count, updatedAt: Date.now() });
    return null;
  },
});

export const commitPresencePage = internalMutation({
  args: { runId: v.id("productSyncRuns"), cursor: v.union(v.string(), v.null()),
    nextCursor: v.string(), done: v.boolean(), checks: v.array(presenceCheckValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status !== "running" || run.phase !== "reconciling" || run.reconcileCursor !== args.cursor) return null;
    const removed = await applyPresenceChecks(ctx, run.shopId, args.checks);
    await ctx.db.patch(run._id, { reconcileCursor: args.nextCursor, phase: args.done ? "completed" : "reconciling",
      checked: run.checked + args.checks.length, removed: run.removed + removed, updatedAt: Date.now() });
    return null;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("productSyncRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status === "running" && run.phase === "completed")
      await ctx.db.patch(run._id, { status: "completed", completedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const fullSync = workflow.define({ args: { runId: v.id("productSyncRuns") }, returns: v.null() })
  .handler(async (step, args): Promise<null> => {
    while (true) {
      const result: { done: boolean } = await step.runAction(internal.productSyncActions.advance, args);
      if (result.done) break;
    }
    await step.runAction(internal.productSyncActions.refresh, args);
    await step.runMutation(internal.productSync.finish, args);
    return null;
  });

export const completed = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ runId: v.id("productSyncRuns") }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.context.runId);
    if (run?.workflowId === args.workflowId && run.status === "running" && args.result.kind !== "success")
      await ctx.db.patch(run._id, { status: "failed", updatedAt: Date.now(), completedAt: Date.now(),
        error: args.result.kind === "failed" ? args.result.error.slice(0, 2000) : "Synchronisation interrompue." });
    return null;
  },
});
