/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Shopify authorization action access", () => {
  test("onboarding requires an approved user and resolves the active backend callback", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.settings.shopifyOnboarding, {})).rejects.toThrow("Authentication required");
    const userId = await t.run((ctx) => ctx.db.insert("users", { approvalStatus: "approved" }));
    const client = t.withIdentity({ subject: userId });
    vi.stubEnv("SHOPIFY_OAUTH_REDIRECT_URL", "");
    for (const deployment of ["curious-greyhound-437", "youthful-bandicoot-479"]) {
      vi.stubEnv("CONVEX_SITE_URL", `https://${deployment}.convex.site`);
      expect(await client.query(api.settings.shopifyOnboarding, {})).toEqual({
        redirectUrl: `https://${deployment}.convex.site/shopify/oauth/callback`,
      });
    }
    vi.stubEnv("SHOPIFY_OAUTH_REDIRECT_URL", "https://custom.example/shopify/oauth/callback");
    expect(await client.query(api.settings.shopifyOnboarding, {})).toEqual({
      redirectUrl: "https://custom.example/shopify/oauth/callback",
    });
    vi.stubEnv("SHOPIFY_OAUTH_REDIRECT_URL", "http://unsafe.example/callback");
    expect(await client.query(api.settings.shopifyOnboarding, {})).toEqual({ redirectUrl: null });
  });

  test("rejects unauthenticated and unapproved callers before Shopify access", async () => {
    const t = convexTest(schema, modules);
    const pendingUserId = await t.run((ctx) =>
      ctx.db.insert("users", { approvalStatus: "pending" }),
    );

    await expect(t.action(api.shopify.authorizationStatus, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(t.action(api.shopify.beginAuthorization, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: pendingUserId })
        .action(api.shopify.authorizationStatus, {}),
    ).rejects.toThrow("waiting for admin approval");
    await expect(
      t
        .withIdentity({ subject: pendingUserId })
        .action(api.shopify.beginAuthorization, {}),
    ).rejects.toThrow("waiting for admin approval");
  });

  test("never falls back to environment credentials for a missing shop id", async () => {
    const t = convexTest(schema, modules);
    const { missingShopId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const missingShopId = await ctx.db.insert("shops", {
        domain: "deleted-authorization-shop.myshopify.com",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(missingShopId);
      return { missingShopId, userId };
    });

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.shopify.authorizationStatus, {
          shopId: missingShopId,
        }),
    ).rejects.toThrow("Shop not found");
  });

  test("does not use client credentials before a saved shop completes OAuth", async () => {
    const t = convexTest(schema, modules);
    const { shopId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "merchant-shop.myshopify.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      return { shopId, userId };
    });

    const result = await t
      .withIdentity({ subject: userId })
      .action(api.shopify.authorizationStatus, { shopId });

    expect(result).toMatchObject({
      shopDomain: "merchant-shop.myshopify.com",
      status: "requested",
      scopes: {
        missing: [],
        requested: ["write_products", "write_files", "write_online_store_navigation"],
        granted: [],
      },
      authorizationUrl: null,
    });

    vi.stubEnv(
      "SHOPIFY_OAUTH_REDIRECT_URL",
      "https://example.convex.site/shopify/oauth/callback",
    );
    const started = await t
      .withIdentity({ subject: userId })
      .action(api.shopify.beginAuthorization, { shopId });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.origin).toBe(
      "https://merchant-shop.myshopify.com",
    );
    expect(authorizationUrl.pathname).toBe("/admin/oauth/authorize");
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "write_products,write_files,write_online_store_navigation",
    );
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://example.convex.site/shopify/oauth/callback",
    );
  });
});
