import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope
} from "./shopScope";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  IMAGE_PROVIDER: "openai",
  GENERATION_EXECUTION_MODE: "realtime",
  VIBE_ANALYSIS: "on",
  VIBE_MODEL: "gemini-2.5-flash-lite",
  OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  OPENAI_IMAGE_SIZE: "1024x1024",
  OPENAI_IMAGE_QUALITY: "medium",
  OPENAI_IMAGE_OUTPUT_FORMAT: "jpeg",
  OPENAI_IMAGE_REQUESTS_PER_MINUTE: 5,
  GEMINI_IMAGE_MODEL: "gemini-3-pro-image-preview",
  GEMINI_IMAGE_SIZE: "2K",
  GEMINI_IMAGE_ASPECT_RATIO: "1:1",
  GEMINI_IMAGE_REQUESTS_PER_MINUTE: 5,
  GENERATION_CONCURRENCY: 1
};

async function settingsForScope(ctx: { db: any }, scope: ShopScope) {
  const rows = await ctx.db.query("appSettings").collect();
  return rows.filter((row: { shopId?: Id<"shops"> }) => shopMatchesScope(row, scope));
}

async function settingForShop(ctx: { db: any }, shopId: Id<"shops">, key: string) {
  return ctx.db
    .query("appSettings")
    .withIndex("by_shop_and_key", (q: any) => q.eq("shopId", shopId).eq("key", key))
    .unique();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const rows = await settingsForScope(ctx, scope);
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((row: Doc<"appSettings">) => [row.key, row.value])) };
  }
});

export const shopInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    return { domain: scope.domain, storeHandle: scope.storeHandle, shopId: scope.shopId ?? null };
  }
});

export const internalList = internalQuery({
  args: { shopId: v.optional(v.union(v.id("shops"), v.null())) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("appSettings").collect();
    const scopedRows = rows.filter((row: { shopId?: Id<"shops"> }) =>
      args.shopId ? row.shopId === args.shopId : row.shopId == null
    );
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(scopedRows.map((row) => [row.key, row.value])) };
  }
});

export const set = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const existing = await settingForShop(ctx, shop._id, args.key);
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: Date.now() });
      return existing._id;
    }

    const legacy = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (legacy && legacy.shopId == null) {
      await ctx.db.patch(legacy._id, {
        shopId: shop._id,
        value: args.value,
        updatedAt: Date.now()
      });
      return legacy._id;
    }

    return ctx.db.insert("appSettings", {
      shopId: shop._id,
      key: args.key,
      value: args.value,
      updatedAt: Date.now()
    });
  }
});
