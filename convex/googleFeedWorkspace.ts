import { ConvexError, v, type Infer } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  assertAttributeReady,
  configForShop,
  configValidator,
  requireOwnedActiveShop,
  validateAttributeValue,
} from "./googleFeed";
import { conflictAttributeValidator } from "./googleFeed/conflictValidators";
import { googleFeedAttributeValidator } from "./googleFeed/validators";
import {
  belongsToView,
  nextProductDraft,
  normalizeFeedSearch,
  readProductDrafts,
  summarizeProduct,
} from "./googleFeed/workspace";
import {
  feedProductValidator,
  feedRowValidator,
  feedViewValidator,
} from "./googleFeed/workspaceValidators";

export const configuration = query({
  args: {},
  returns: configValidator,
  handler: async (ctx) => {
    const { shopId } = await requireOwnedActiveShop(ctx);
    const config = await configForShop(ctx, shopId);
    return config
      ? {
          status: config.status,
          googleAppStatus: config.googleAppStatus,
          attributes: config.attributes,
          checkedAt: config.checkedAt,
        }
      : null;
  },
});

export const activity = query({
  args: {},
  returns: v.union(
    v.object({
      id: v.id("googleFeedRuns"),
      kind: v.union(v.literal("publication"), v.literal("evaluation")),
      succeeded: v.number(),
      failed: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const { shopId } = await requireOwnedActiveShop(ctx);
    const recent = await ctx.db
      .query("googleFeedRuns")
      .withIndex("by_shop_id_and_created_at", (index) =>
        index.eq("shopId", shopId),
      )
      .order("desc")
      .take(20);
    const run = recent.find((item) => item.status === "running");
    return run
      ? {
          id: run._id,
          kind: run.kind,
          succeeded: run.succeededItems,
          failed: run.failedItems,
        }
      : null;
  },
});

export const listProducts = query({
  args: {
    view: feedViewValidator,
    after: v.optional(v.id("products")),
    search: v.optional(v.string()),
  },
  returns: v.object({
    products: v.array(feedProductValidator),
    after: v.union(v.id("products"), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx);
    const search = normalizeFeedSearch(args.search ?? "");
    const products = [];
    let after = args.after;
    let readRows = 0;
    for (let scanned = 0; scanned < 60 && products.length < 10; scanned++) {
      const head = await nextProductDraft(ctx, shopId, args.view, after);
      if (!head) return { products, after: after ?? null, hasMore: false };
      after = head.productId;
      const product = await ctx.db.get(head.productId);
      if (!product || product.shopId !== shopId) continue;
      if (
        search &&
        !normalizeFeedSearch(`${product.title} ${product.handle}`).includes(
          search,
        )
      )
        continue;
      const rows = await readProductDrafts(ctx, shopId, product._id);
      readRows += rows.length;
      const summary = summarizeProduct(product, rows, args.view);
      if (summary.fieldCount) products.push(summary);
      // Bound aggregate reads too, including products whose drafts are no-ops.
      if (readRows >= 8_000) break;
    }
    return {
      products,
      after: after ?? null,
      hasMore: Boolean(await nextProductDraft(ctx, shopId, args.view, after)),
    };
  },
});

export const countProducts = query({
  args: { view: feedViewValidator },
  returns: v.object({ count: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx);
    let count = 0;
    let after: Id<"products"> | undefined;
    let fallbackReads = 0;
    for (let scanned = 0; scanned < 500; scanned++) {
      const head = await nextProductDraft(ctx, shopId, args.view, after);
      if (!head) return { count, hasMore: false };
      after = head.productId;
      if (belongsToView(head, args.view)) count++;
      else {
        const rows = await readProductDrafts(ctx, shopId, after);
        fallbackReads += rows.length;
        if (rows.some((row) => belongsToView(row, args.view))) count++;
        if (fallbackReads >= 2_000) break;
      }
    }
    return {
      count,
      hasMore: Boolean(await nextProductDraft(ctx, shopId, args.view, after)),
    };
  },
});

export const productDetails = query({
  args: { productId: v.id("products"), view: feedViewValidator },
  returns: v.object({
    product: feedProductValidator,
    rows: v.array(feedRowValidator),
    manualRows: v.array(feedRowValidator),
    conflicts: v.array(conflictAttributeValidator),
  }),
  handler: async (ctx, args) => {
    const { shopId } = await requireOwnedActiveShop(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product || product.shopId !== shopId)
      throw new ConvexError("Produit introuvable.");
    const drafts = await readProductDrafts(ctx, shopId, product._id);
    const selected = drafts.filter((row) => belongsToView(row, args.view));
    const manual = drafts.filter((row) => row.sourceKind === "manual");
    const variants = await Promise.all(
      [
        ...new Set(
          [...selected, ...manual].flatMap((row) =>
            row.variantId ? [row.variantId] : [],
          ),
        ),
      ].map((id) => ctx.db.get(id)),
    );
    const variantMap = new Map(
      variants
        .filter(
          (variant) =>
            variant &&
            variant.shopId === shopId &&
            variant.productId === product._id,
        )
        .map((variant) => [variant!._id, variant!]),
    );
    const toRow = (row: (typeof drafts)[number]) => ({
      id: row._id,
      variantId: row.variantId ?? null,
      variantTitle: row.variantId
        ? (variantMap.get(row.variantId)?.title ?? "Variante indisponible")
        : "Produit",
      attribute: row.attribute,
      currentValue: row.currentValue,
      proposedValue: row.proposedValue,
      sourceKind: row.sourceKind,
      sourceLabel: row.sourceLabel,
      status: row.status,
      included: row.included,
      updatedAt: row.updatedAt,
      error: row.error ?? null,
    });
    let conflicts: Infer<typeof conflictAttributeValidator>[] = [];
    if (selected.some((row) => row.status === "conflict")) {
      const details: {
        attributes: Infer<typeof conflictAttributeValidator>[];
      } = await ctx.runQuery(api.googleFeedConflicts.productDetails, {
        productId: product._id,
      });
      conflicts = details.attributes;
    }
    return {
      product: summarizeProduct(product, drafts, args.view),
      rows: selected.map(toRow),
      manualRows: manual.map(toRow),
      conflicts,
    };
  },
});

export const choose = mutation({
  args: {
    productId: v.id("products"),
    attribute: googleFeedAttributeValidator,
    value: v.string(),
    rows: v.array(
      v.object({ id: v.id("googleFeedDrafts"), updatedAt: v.number() }),
    ),
  },
  returns: v.object({ updated: v.number(), preserved: v.number() }),
  handler: async (ctx, args) => {
    const { userId, shopId } = await requireOwnedActiveShop(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product || product.shopId !== shopId)
      throw new ConvexError("Produit introuvable.");
    if (!args.rows.length || args.rows.length > 1_000)
      throw new ConvexError("Sélectionnez les variantes à corriger.");
    assertAttributeReady(await configForShop(ctx, shopId), args.attribute);
    const value = validateAttributeValue(args.attribute, args.value);
    let updated = 0;
    let preserved = 0;
    for (const expected of new Map(
      args.rows.map((row) => [row.id, row]),
    ).values()) {
      const row = await ctx.db.get(expected.id);
      if (
        !row ||
        row.shopId !== shopId ||
        row.productId !== product._id ||
        row.attribute !== args.attribute
      )
        throw new ConvexError(
          "Cette modification n’appartient pas au produit sélectionné.",
        );
      // A concurrent manual correction always wins, even if it was made after
      // the inspector loaded. Publishing/confirmed/excluded rows are untouched.
      if (
        row.sourceKind === "manual" ||
        !row.included ||
        !["conflict", "invalid", "draft"].includes(row.status)
      ) {
        preserved++;
        continue;
      }
      if (row.updatedAt !== expected.updatedAt)
        throw new ConvexError(
          "Les propositions ont changé. Rechargez ce produit.",
        );
      await ctx.db.patch(row._id, {
        proposedValue: value,
        sourceKind: "manual",
        sourceRuleId: null,
        matchingRuleIds: undefined,
        sourceLabel: "Correction manuelle",
        status: "draft",
        error: null,
        createdByUserId: userId,
        updatedAt: Date.now(),
      });
      updated++;
    }
    return { updated, preserved };
  },
});
