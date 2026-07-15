/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

describe("Shopify OAuth persistence", () => {
  test("stores the authorized token once and consumes the state", async () => {
    const t = convexTest(schema, modules);
    const { shopId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        approvalStatus: "approved",
      });
      const shopId = await ctx.db.insert("shops", {
        domain: "demo-store.myshopify.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      return { shopId, userId };
    });
    const stateHash = "a".repeat(64);
    await t.mutation(internal.shopify.createShopifyOauthAttempt, {
      stateHash,
      shopId,
      userId,
      shopDomain: "demo-store.myshopify.com",
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      t.mutation(internal.shopify.completeShopifyOauthAttempt, {
        stateHash,
        shopDomain: "demo-store.myshopify.com",
        accessToken: "incomplete-token",
        scopes: ["write_products"],
      }),
    ).rejects.toThrow("write_files");

    await t.mutation(internal.shopify.completeShopifyOauthAttempt, {
      stateHash,
      shopDomain: "demo-store.myshopify.com",
      accessToken: "authorized-token",
      scopes: ["write_files", "write_products", "read_products"],
    });

    const result = await t.run(async (ctx) => ({
      shop: await ctx.db.get(shopId),
      attempt: await ctx.db
        .query("shopifyOauthAttempts")
        .withIndex("by_state_hash", (query) =>
          query.eq("stateHash", stateHash),
        )
        .unique(),
    }));
    expect(result.shop?.accessToken).toBe("authorized-token");
    expect(result.shop?.accessTokenScopes).toEqual([
      "write_files",
      "write_products",
      "read_products",
    ]);
    expect(result.attempt).toBeNull();

    await expect(
      t.mutation(internal.shopify.completeShopifyOauthAttempt, {
        stateHash,
        shopDomain: "demo-store.myshopify.com",
        accessToken: "replayed-token",
        scopes: ["write_products", "write_files"],
      }),
    ).rejects.toThrow("invalid or expired");
  });
});
