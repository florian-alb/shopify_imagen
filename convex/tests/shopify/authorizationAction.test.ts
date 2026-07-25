/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

describe("Shopify authorization action access", () => {
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
});
