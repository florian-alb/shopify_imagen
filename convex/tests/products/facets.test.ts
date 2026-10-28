/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { mergeFacets, PRODUCT_FACETS_KEY } from "../../products/catalog";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

function product(shopId?: Id<"shops">): Omit<Doc<"products">, "_id" | "_creationTime"> {
  return {
    shopId,
    shopifyProductId: "gid://shopify/Product/1",
    title: "Rideau",
    handle: "rideau",
    productType: "Rideaux",
    shopifyStatus: "ACTIVE",
    tags: [], collections: [], options: [], variants: [], metafields: [], currentShopifyImages: [],
    generationStatus: "not_started",
    createdAt: 1, updatedAt: 1,
  };
}

test("facet pages read only the requested shop and exclude visual family members", async () => {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead: 16 * 1024 } });
  const shopId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const shopId = await ctx.db.insert("shops", {
      domain: "facets.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    // A global scan fails even though the requested shop is small.
    await ctx.db.insert("products", {
      ...product(), productType: "Legacy", metafields: [{ value: "x".repeat(32 * 1024) }],
    });
    const otherShopId = await ctx.db.insert("shops", {
      domain: "other-facets.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("products", {
      ...product(otherShopId), productType: "Autre boutique",
      metafields: [{ value: "x".repeat(32 * 1024) }],
    });
    const sourceProductId = await ctx.db.insert("products", product(shopId));
    const configId = await ctx.db.insert("visualGroupConfigs", {
      shopId, productId: sourceProductId, optionNames: [], publishMode: "separate_products",
      analysisStatus: "ready", createdAt: 1, updatedAt: 1,
    });
    const groupId = await ctx.db.insert("visualGroups", {
      shopId, configId, productId: sourceProductId, key: "bleu", label: "Bleu",
      optionValues: [], position: 0, createdAt: 1, updatedAt: 1,
    });
    const familyId = await ctx.db.insert("visualProductFamilies", {
      shopId, sourceProductId, sourceShopifyProductId: "gid://shopify/Product/1",
      configId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("products", {
      ...product(shopId), shopifyProductId: "gid://shopify/Product/2", productType: "Membre masqué",
    });
    await ctx.db.insert("visualProductFamilyMembers", {
      shopId, familyId, groupId, shopifyProductId: "gid://shopify/Product/2",
      title: "Membre masqué", createdAt: 1, updatedAt: 1,
    });
    return shopId;
  });

  expect(await t.query(internal.products.facetPage, {
    shopId, paginationOpts: { cursor: null, numItems: 100, maximumBytesRead: 2 * 1024 * 1024 },
  })).toMatchObject({
    isDone: true,
    facets: { productTypes: ["Rideaux"], shopifyStatuses: ["ACTIVE"], collections: [] },
  });
});

test("facet merging deduplicates collections by identity and keeps the latest title", () => {
  expect(mergeFacets({
    productTypes: ["Stores", "Rideaux"], shopifyStatuses: ["DRAFT"],
    collections: [{ id: "1", title: "Ancien nom", handle: "ancien" }],
  }, {
    productTypes: ["Rideaux"], shopifyStatuses: ["ACTIVE", "DRAFT"],
    collections: [{ id: "2", title: "Voilages" }, { id: "1", title: "Nouveau nom", handle: "nouveau" }],
  })).toEqual({
    productTypes: ["Rideaux", "Stores"], shopifyStatuses: ["ACTIVE", "DRAFT"],
    collections: [{ id: "1", title: "Nouveau nom", handle: "nouveau" }, { id: "2", title: "Voilages" }],
  });
});

test("storing empty legacy facets preserves shop caches and replaces stale values", async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const { scopedId, legacyId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const shopId = await ctx.db.insert("shops", {
      domain: "cached-facets.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    const value = { productTypes: ["Ancien type"], shopifyStatuses: [], collections: [] };
    const scopedId = await ctx.db.insert("appSettings", {
      shopId, key: PRODUCT_FACETS_KEY, value, updatedAt: 1,
    });
    const legacyId = await ctx.db.insert("appSettings", {
      key: PRODUCT_FACETS_KEY, value, updatedAt: 1,
    });
    return { scopedId, legacyId };
  });
  const empty = { productTypes: [], shopifyStatuses: [], collections: [] };
  expect(await t.mutation(internal.products.storeFacets, { shopId: null, facets: empty })).toBe(legacyId);
  await t.run(async (ctx) => {
    expect((await ctx.db.get(legacyId))?.value).toEqual(empty);
    expect((await ctx.db.get(scopedId))?.value.productTypes).toEqual(["Ancien type"]);
  });
});
