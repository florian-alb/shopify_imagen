import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import {
  ensureActiveShop,
  envShopifyCredentials,
  getActiveShopScope,
  normalizeShopDomain,
  publicEnvironmentShop,
  publicShop,
  shopifyCredentialsForShop
} from "./shopScope";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    const shops = await ctx.db.query("shops").collect();
    const activeShopId = user?.activeShopId ?? shops[0]?._id ?? null;
    const rows = shops.map((shop) => publicShop(shop, activeShopId));
    if (!rows.length) {
      const envShop = publicEnvironmentShop(true);
      return envShop ? [envShop] : [];
    }
    return rows.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.domain.localeCompare(b.domain);
    });
  }
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    if (scope.shop) return publicShop(scope.shop, scope.shop._id);
    const envShop = publicEnvironmentShop(scope.source === "environment");
    return envShop ?? null;
  }
});

export const connect = mutation({
  args: {
    domain: v.string(),
    name: v.optional(v.string()),
    clientId: v.string(),
    clientSecret: v.string(),
    productQuery: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const domain = normalizeShopDomain(args.domain);
    const clientId = args.clientId.trim();
    const clientSecret = args.clientSecret.trim();
    if (!clientId || !clientSecret) {
      throw new Error("Client ID and client secret are required to connect a shop.");
    }

    const now = Date.now();
    const existing = await ctx.db.query("shops").withIndex("by_domain", (q) => q.eq("domain", domain)).unique();

    const payload = {
      domain,
      name: args.name?.trim() || null,
      clientId,
      clientSecret,
      productQuery: args.productQuery?.trim() || null,
      updatedAt: now
    };

    let shopId: Id<"shops">;
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      shopId = existing._id;
    } else {
      shopId = await ctx.db.insert("shops", {
        ...payload,
        createdByUserId: userId,
        createdAt: now
      });
    }

    await ctx.db.patch(userId, { activeShopId: shopId, updatedAt: now });
    return shopId;
  }
});

export const ensureDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    return shop._id;
  }
});

export const setActive = mutation({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ctx.db.get(args.shopId);
    if (!shop) throw new Error("Shop not found.");
    await ctx.db.patch(userId, { activeShopId: args.shopId, updatedAt: Date.now() });
    return args.shopId;
  }
});

export const getShopifyCredentials = internalQuery({
  args: {
    shopId: v.optional(v.union(v.id("shops"), v.null())),
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    if (args.shopId) {
      const shop = await ctx.db.get(args.shopId);
      return shopifyCredentialsForShop(shop);
    }
    if (args.userId) {
      const scope = await getActiveShopScope(ctx, args.userId);
      return shopifyCredentialsForShop(scope.shop);
    }
    return shopifyCredentialsForShop(null);
  }
});

export const ensureActiveForAction = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const shop = await ensureActiveShop(ctx, args.userId);
    return shopifyCredentialsForShop(shop);
  }
});

export const envConfigured = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return Boolean(envShopifyCredentials());
  }
});
