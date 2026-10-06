/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

test("catalogue total includes all pages of the active shop regardless of list filters", async () => {
  const t = convexTest(schema, modules);
  const { userId, productIds } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "catalogue-total.myshopify.com",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherShopId = await ctx.db.insert("shops", {
      domain: "other-catalogue.myshopify.com",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productIds = [];
    for (let index = 0; index < 126; index++) {
      productIds.push(await ctx.db.insert("products", {
        shopId: index === 125 ? otherShopId : shopId,
        shopifyProductId: `gid://shopify/Product/${index}`,
        title: `Produit ${index}`,
        handle: `produit-${index}`,
        tags: [],
        collections: [],
        options: [],
        variants: [],
        metafields: [],
        currentShopifyImages: [],
        generationStatus: "not_started",
        createdAt: 1,
        updatedAt: 1,
      }));
    }
    return { userId, productIds };
  });
  const client = t.withIdentity({ subject: userId });
  expect(await client.query(api.products.navigation, {})).toEqual({
    previous: null,
    next: null,
    position: null,
    total: 125,
  });
  const firstPage = await client.query(api.products.list, { limit: 100 });
  expect(firstPage.page).toHaveLength(100);
  expect(firstPage.hasNext).toBe(true);
  const lastPage = await client.query(api.products.list, { offset: 100, limit: 100 });
  expect(lastPage.page).toHaveLength(25);
  const emptySearch = await client.query(api.products.list, { search: "absent" });
  expect(emptySearch.page).toEqual([]);
  expect((await client.query(api.products.navigation, {})).total).toBe(125);

  const navigation = await client.query(api.products.navigation, {
    productId: productIds[0],
    search: "Produit 0",
  });
  expect(navigation).toMatchObject({ position: 1, total: 1, previous: null, next: null });
});

test("catalogue total requires authentication", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.products.navigation, {})).rejects.toThrow();
});
