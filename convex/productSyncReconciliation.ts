import { paginationOptsValidator } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { candidateValidator } from "./productSyncModel";

export const candidatePage = internalQuery({
  args: { shopId: v.id("shops"), startedAt: v.number(), paginationOpts: paginationOptsValidator },
  returns: v.object({ candidates: v.array(candidateValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("products").withIndex("by_shop", q => q.eq("shopId", args.shopId))
      .paginate(args.paginationOpts);
    return { candidates: page.page.filter(product => (product.lastSyncedAt ?? 0) < args.startedAt).map(product => ({
      id: product._id, shopifyProductId: product.shopifyProductId, updatedAt: product.updatedAt,
      ...(product.lastSyncedAt === undefined ? {} : { lastSyncedAt: product.lastSyncedAt }),
    })), isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const presenceCheckValidator = candidateValidator.extend({ missing: v.boolean() });

export async function applyPresenceChecks(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  checks: Infer<typeof presenceCheckValidator>[],
) {
  if (checks.length > 25) throw new ConvexError("Lot de vérification trop grand.");
  let removed = 0;
  for (const check of checks) {
    const product = await ctx.db.get(check.id);
    if (!product || product.shopId !== shopId || product.shopifyProductId !== check.shopifyProductId)
      throw new ConvexError("Produit vérifié hors de la boutique attendue.");
    // Another sync/manual write since the read wins over a stale absence check.
    if (product.updatedAt !== check.updatedAt || product.lastSyncedAt !== check.lastSyncedAt) continue;
    const now = Date.now();
    if (!check.missing) {
      await ctx.db.patch(product._id, { shopifyDeletedAt: undefined, shopifyPresenceCheckedAt: now, updatedAt: now });
      continue;
    }
    const archivedAt = product.shopifyDeletedAt ?? now;
    if (product.shopifyDeletedAt == null) removed++;
    await ctx.db.patch(product._id, { shopifyDeletedAt: archivedAt, shopifyPresenceCheckedAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.productSyncReconciliation.cleanupProductDrafts, {
      productId: product._id, archivedAt, cursor: null,
    });
  }
  return removed;
}

export const applyVerifiedPresence = internalMutation({
  args: { shopId: v.id("shops"), checks: v.array(presenceCheckValidator) },
  returns: v.number(),
  handler: async (ctx, args) => applyPresenceChecks(ctx, args.shopId, args.checks),
});

export const cleanupProductDrafts = internalMutation({
  args: { productId: v.id("products"), archivedAt: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || product.shopifyDeletedAt !== args.archivedAt) return null;
    const page = await ctx.db.query("googleFeedDrafts")
      .withIndex("by_product_id", q => q.eq("productId", product._id))
      .paginate({ cursor: args.cursor, numItems: 100, maximumBytesRead: 512 * 1024 });
    for (const draft of page.page) {
      if (draft.shopId === product.shopId && draft.included)
        await ctx.db.patch(draft._id, { included: false, updatedAt: Date.now() });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.productSyncReconciliation.cleanupProductDrafts, {
      ...args, cursor: page.continueCursor,
    });
    return null;
  },
});
