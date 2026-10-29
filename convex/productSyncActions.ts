import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { refreshFacets } from "./products/facets";
import type { ShopifyCredentials } from "./shopScope";
import { shopifyGraphql } from "./shopify/client";
import { PRODUCTS_QUERY } from "./shopify/graphql";
import { mapProductForUpsert, mapVariantsForGoogleFeed } from "./shopify/productMapping";
import { googleFeedQueryVariables, type GoogleFeedSyncCoordinates } from "./shopify/productQuery";
import { loadRemainingGoogleFeedVariants, readMissingProducts, validateProductPage } from "./shopify/productSyncHelpers";

type Candidate = { id: Id<"products">; shopifyProductId: string; updatedAt: number; lastSyncedAt?: number };
type CandidatePage = { candidates: Candidate[]; isDone: boolean; continueCursor: string };

export async function reconcileMissingProducts(ctx: ActionCtx, shopId: Id<"shops">, startedAt: number) {
  const credentials = await ctx.runQuery(internal.shops.getShopifyCredentials, { shopId }) as ShopifyCredentials;
  let cursor: string | null = null;
  let removed = 0;
  while (true) {
    const page: CandidatePage = await ctx.runQuery(internal.productSyncReconciliation.candidatePage, {
      shopId, startedAt, paginationOpts: { cursor, numItems: 25, maximumBytesRead: 2 * 1024 * 1024 },
    });
    const missing = await readMissingProducts(ctx, credentials, page.candidates.map(product => product.shopifyProductId));
    if (page.candidates.length) removed += await ctx.runMutation(internal.productSyncReconciliation.applyVerifiedPresence, {
      shopId, checks: page.candidates.map(product => ({ ...product, missing: missing.has(product.shopifyProductId) })),
    });
    if (page.isDone) return removed;
    cursor = page.continueCursor;
  }
}

export const advance = internalAction({
  args: { runId: v.id("productSyncRuns") }, returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const run = await ctx.runQuery(internal.productSync.getRun, args) as Doc<"productSyncRuns"> | null;
    if (!run || run.status !== "running" || run.phase === "completed") return { done: true };
    const credentials = await ctx.runQuery(internal.shops.getShopifyCredentials, { shopId: run.shopId }) as ShopifyCredentials;
    if (run.phase === "syncing") {
      const coordinates = await ctx.runQuery(internal.googleFeed.getSyncCoordinates, { shopId: run.shopId }) as GoogleFeedSyncCoordinates;
      const page = validateProductPage(await shopifyGraphql<unknown>(PRODUCTS_QUERY, {
        first: 20, after: run.syncCursor, query: run.productQuery, ...googleFeedQueryVariables(coordinates),
      }, undefined, credentials), run.syncCursor);
      for (const product of page.nodes) {
        await loadRemainingGoogleFeedVariants(product, coordinates, credentials);
        const id = await ctx.runMutation(internal.products.upsertSynced, mapProductForUpsert(product, credentials));
        await ctx.runMutation(internal.googleFeed.upsertSyncedVariants, {
          shopId: run.shopId, productId: id, variants: mapVariantsForGoogleFeed(product), removeMissing: true,
        });
      }
      await ctx.runMutation(internal.productSync.commitScanPage, {
        runId: run._id, cursor: run.syncCursor, nextCursor: page.endCursor,
        done: !page.hasNextPage, count: page.nodes.length,
      });
      return { done: false };
    }
    const page: CandidatePage = await ctx.runQuery(internal.productSyncReconciliation.candidatePage, {
      shopId: run.shopId, startedAt: run.startedAt,
      paginationOpts: { cursor: run.reconcileCursor, numItems: 25, maximumBytesRead: 2 * 1024 * 1024 },
    });
    const missing = await readMissingProducts(ctx, credentials, page.candidates.map(product => product.shopifyProductId));
    await ctx.runMutation(internal.productSync.commitPresencePage, {
      runId: run._id, cursor: run.reconcileCursor, nextCursor: page.continueCursor, done: page.isDone,
      checks: page.candidates.map(product => ({ ...product, missing: missing.has(product.shopifyProductId) })),
    });
    return { done: page.isDone };
  },
});

export const refresh = internalAction({
  args: { runId: v.id("productSyncRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.productSync.getRun, args) as Doc<"productSyncRuns"> | null;
    if (run?.status === "running" && run.phase === "completed") await refreshFacets(ctx, run.shopId);
    return null;
  },
});
