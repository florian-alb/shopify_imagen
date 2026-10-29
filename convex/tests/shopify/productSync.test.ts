/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, expect, test, vi } from "vitest";

import { api } from "../../_generated/api";
import schema from "../../schema";
import { shopifyGraphql } from "../../shopify/client";
import { PRODUCTS_QUERY } from "../../shopify/graphql";

vi.mock("../../shopify/client", () => ({
  shopifyGraphql: vi.fn(),
  getAccessToken: vi.fn(),
}));

const modules = import.meta.glob("../../**/*.ts");
const graphql = vi.mocked(shopifyGraphql);

beforeEach(() => {
  graphql.mockReset();
});

async function fixture() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "full-sync.myshopify.com",
      clientId: "test",
      clientSecret: "test",
      productQuery: "status:active,draft,archived",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    return userId;
  });
  return { t, client: t.withIdentity({ subject: userId }) };
}

function mockCatalogue(total: number, metafieldBytes = 0) {
  graphql.mockImplementation(async (query, variables, _token, credentials) => {
    expect(query).toBe(PRODUCTS_QUERY);
    expect(credentials?.domain).toBe("full-sync.myshopify.com");
    expect(variables.query).toBe("status:active,draft,archived");
    const { first, after } = variables as { first: number; after: string | null };
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(20);
    const start = after === null ? 0 : Number(after);
    const end = Math.min(start + first, total);
    return {
      products: {
        nodes: Array.from({ length: end - start }, (_, offset) => ({
          id: `gid://shopify/Product/${start + offset}`,
          title: `Produit ${start + offset}`,
          handle: `produit-${start + offset}`,
          status: "ACTIVE",
          productType: metafieldBytes ? `Type ${start + offset}` : "Rideaux",
          metafields: { nodes: metafieldBytes ? [{ value: "x".repeat(metafieldBytes) }] : [] },
          variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        })),
        pageInfo: { hasNextPage: end < total, endCursor: String(end) },
      },
    };
  });
}

test("full sync imports beyond 250 and 1000, and repeated syncs do not duplicate products", async () => {
  const { client } = await fixture();
  mockCatalogue(1105);
  expect(await client.action(api.shopify.syncProducts, {})).toEqual({ synced: 1105 });
  expect(graphql).toHaveBeenCalledTimes(56);
  expect((await client.query(api.products.navigation, {})).total).toBe(1105);
  expect((await client.query(api.products.facets, {})).productTypes).toEqual(["Rideaux"]);
  const lastProduct = await client.query(api.products.list, { search: "produit-1104" });
  expect(lastProduct.page).toHaveLength(1);

  graphql.mockClear();
  expect(await client.action(api.shopify.syncProducts, {})).toEqual({ synced: 1105 });
  expect((await client.query(api.products.navigation, {})).total).toBe(1105);
}, 20_000);

test("an explicit limit is honored beyond 250 and within the last page", async () => {
  const { client } = await fixture();
  mockCatalogue(1105);
  expect(await client.action(api.shopify.syncProducts, { limit: 273 })).toEqual({ synced: 273 });
  expect(graphql).toHaveBeenCalledTimes(14);
  expect(graphql.mock.calls.at(-1)?.[1]).toMatchObject({ first: 13, after: "260" });
  expect((await client.query(api.products.navigation, {})).total).toBe(273);
});

test("sync rebuilds every facet when product documents exceed the transaction read limit", async () => {
  const { client } = await fixture();
  // Over 20 MiB in one shop: even a shop-indexed collect exceeds 16 MiB.
  mockCatalogue(70, 300 * 1024);
  expect(await client.action(api.shopify.syncProducts, {})).toEqual({ synced: 70 });
  expect((await client.query(api.products.facets, {})).productTypes).toEqual(
    Array.from({ length: 70 }, (_, index) => `Type ${index}`).sort(),
  );

  const { page: [product] } = await client.query(api.products.list, { limit: 1 });
  graphql.mockResolvedValueOnce({
    product: {
      id: product.shopifyProductId,
      title: product.title,
      handle: product.handle,
      productType: "Nouveau type",
      status: "DRAFT",
      variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
  });
  await client.action(api.shopify.syncProduct, { productId: product._id });
  expect(await client.query(api.products.facets, {})).toMatchObject({
    productTypes: [
      ...Array.from({ length: 70 }, (_, index) => `Type ${index}`)
        .filter((type) => type !== `Type ${product.shopifyProductId.split("/").at(-1)}`),
      "Nouveau type",
    ].sort(),
    shopifyStatuses: ["ACTIVE", "DRAFT"],
  });
}, 30_000);

test("empty catalogues finish and incomplete pagination fails rather than looping", async () => {
  const { client } = await fixture();
  mockCatalogue(0);
  expect(await client.action(api.shopify.syncProducts, {})).toEqual({ synced: 0 });
  for (const endCursor of [null, "20"]) {
    graphql.mockReset();
    mockCatalogue(50);
    graphql.mockResolvedValueOnce({
      products: {
        nodes: [{ id: "first", title: "Premier", handle: "premier", variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }],
        pageInfo: { hasNextPage: true, endCursor: "20" },
      },
    });
    graphql.mockResolvedValueOnce({
      products: {
        nodes: [{ id: "second", title: "Deuxième", handle: "deuxieme" }],
        pageInfo: { hasNextPage: true, endCursor },
      },
    });
    await expect(client.action(api.shopify.syncProducts, {})).rejects.toThrow("curseur valide");
    expect(graphql).toHaveBeenCalledTimes(2);
  }
});

test("authentication and valid explicit limits are required before Shopify calls", async () => {
  const { t, client } = await fixture();
  await expect(t.action(api.shopify.syncProducts, {})).rejects.toThrow("Authentication required");
  for (const limit of [0, -1, 2.5, Infinity, NaN]) {
    await expect(client.action(api.shopify.syncProducts, { limit })).rejects.toThrow("entier positif");
  }
  expect(graphql).not.toHaveBeenCalled();
});
