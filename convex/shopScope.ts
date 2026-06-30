import type { Doc, Id } from "./_generated/dataModel";

type DbCtx = { db: any };

export type ShopScope = {
  shopId?: Id<"shops">;
  shop: Doc<"shops"> | null;
  domain: string | null;
  storeHandle: string | null;
  includeLegacy: boolean;
  source: "database" | "environment" | "none";
};

export type ShopifyCredentials = {
  shopId?: Id<"shops">;
  domain: string;
  storeHandle: string;
  clientId: string;
  clientSecret: string;
  productQuery: string;
};

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function normalizeShopDomain(domain: string) {
  const trimmed = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  if (!trimmed) throw new Error("Shop domain is required.");
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

export function storeHandleFromDomain(domain: string) {
  return normalizeShopDomain(domain).replace(/\.myshopify\.com$/, "");
}

export function envShopDomain() {
  const raw = env("SHOPIFY_SHOP_DOMAIN").trim();
  return raw ? normalizeShopDomain(raw) : null;
}

export function envProductQuery() {
  return env("SHOPIFY_PRODUCT_QUERY", "status:active,draft,archived");
}

export function envShopifyCredentials(): ShopifyCredentials | null {
  const domain = envShopDomain();
  if (!domain) return null;
  return {
    domain,
    storeHandle: storeHandleFromDomain(domain),
    clientId: env("SHOPIFY_CLIENT_ID"),
    clientSecret: env("SHOPIFY_CLIENT_SECRET"),
    productQuery: envProductQuery()
  };
}

export function publicShop(shop: Doc<"shops">, activeShopId?: Id<"shops"> | null) {
  return {
    _id: shop._id,
    domain: shop.domain,
    storeHandle: storeHandleFromDomain(shop.domain),
    name: shop.name ?? storeHandleFromDomain(shop.domain),
    productQuery: shop.productQuery ?? envProductQuery(),
    hasClientCredentials: Boolean(shop.clientId && shop.clientSecret),
    isActive: activeShopId === shop._id,
    source: "database" as const,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt
  };
}

export function publicEnvironmentShop(active: boolean) {
  const credentials = envShopifyCredentials();
  if (!credentials) return null;
  return {
    _id: null,
    domain: credentials.domain,
    storeHandle: credentials.storeHandle,
    name: credentials.storeHandle,
    productQuery: credentials.productQuery,
    hasClientCredentials: Boolean(credentials.clientId && credentials.clientSecret),
    isActive: active,
    source: "environment" as const,
    createdAt: null,
    updatedAt: null
  };
}

export function shopMatchesScope(row: { shopId?: Id<"shops"> }, scope: ShopScope) {
  if (scope.shopId && row.shopId === scope.shopId) return true;
  return scope.includeLegacy && row.shopId == null;
}

export async function getActiveShopScope(ctx: DbCtx, userId: Id<"users">): Promise<ShopScope> {
  const user = await ctx.db.get(userId);
  if (user?.activeShopId) {
    const active = await ctx.db.get(user.activeShopId);
    if (active) {
      const domain = normalizeShopDomain(active.domain);
      return {
        shopId: active._id,
        shop: active,
        domain,
        storeHandle: storeHandleFromDomain(domain),
        includeLegacy: envShopDomain() === domain,
        source: "database"
      };
    }
  }

  const firstShop = await ctx.db.query("shops").order("asc").first();
  if (firstShop) {
    const domain = normalizeShopDomain(firstShop.domain);
    return {
      shopId: firstShop._id,
      shop: firstShop,
      domain,
      storeHandle: storeHandleFromDomain(domain),
      includeLegacy: envShopDomain() === domain,
      source: "database"
    };
  }

  const envShop = envShopifyCredentials();
  if (envShop) {
    return {
      shop: null,
      domain: envShop.domain,
      storeHandle: envShop.storeHandle,
      includeLegacy: true,
      source: "environment"
    };
  }

  return {
    shop: null,
    domain: null,
    storeHandle: null,
    includeLegacy: false,
    source: "none"
  };
}

export async function ensureActiveShop(ctx: DbCtx, userId: Id<"users">) {
  const scope = await getActiveShopScope(ctx, userId);
  if (scope.shop) {
    const user = await ctx.db.get(userId);
    if (user?.activeShopId !== scope.shop._id) {
      await ctx.db.patch(userId, { activeShopId: scope.shop._id, updatedAt: Date.now() });
    }
    return scope.shop;
  }

  const envShop = envShopifyCredentials();
  if (!envShop) {
    throw new Error("Connect a Shopify shop before syncing products or creating generation jobs.");
  }

  const existing = await ctx.db.query("shops").withIndex("by_domain", (q: any) => q.eq("domain", envShop.domain)).unique();
  if (existing) {
    await ctx.db.patch(userId, { activeShopId: existing._id, updatedAt: Date.now() });
    return existing;
  }

  const now = Date.now();
  const shopId = await ctx.db.insert("shops", {
    domain: envShop.domain,
    name: envShop.storeHandle,
    clientId: envShop.clientId || null,
    clientSecret: envShop.clientSecret || null,
    productQuery: envShop.productQuery,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now
  });
  await ctx.db.patch(userId, { activeShopId: shopId, updatedAt: now });
  const shop = await ctx.db.get(shopId);
  if (!shop) throw new Error("Failed to create active shop.");
  return shop;
}

export function shopifyCredentialsForShop(shop: Doc<"shops"> | null | undefined): ShopifyCredentials {
  const envCredentials = envShopifyCredentials();
  if (!shop) {
    if (!envCredentials) throw new Error("Connect a Shopify shop before using Shopify actions.");
    if (!envCredentials.clientId || !envCredentials.clientSecret) {
      throw new Error("SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required.");
    }
    return envCredentials;
  }

  const domain = normalizeShopDomain(shop.domain);
  const clientId = shop.clientId ?? env("SHOPIFY_CLIENT_ID");
  const clientSecret = shop.clientSecret ?? env("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(`Shopify credentials are missing for ${domain}.`);
  }
  return {
    shopId: shop._id,
    domain,
    storeHandle: storeHandleFromDomain(domain),
    clientId,
    clientSecret,
    productQuery: shop.productQuery ?? envProductQuery()
  };
}
