import { describe, expect, it } from "vitest";

import { normalizeShopDomain } from "../../shopScope";
import {
  buildShopifyAuthorizationStatus,
  requireShopifyAdminScopes,
  type ShopifyAuthorizationInstallation,
} from "../../shopify/authorization";

const SHOP_DOMAIN = "demo-store.myshopify.com";

function installation(
  overrides: Omit<Partial<ShopifyAuthorizationInstallation>, "app"> & {
    app?: Partial<ShopifyAuthorizationInstallation["app"]>;
  } = {},
): ShopifyAuthorizationInstallation {
  return {
    accessScopes: [
      { handle: "write_products" },
      { handle: "write_files" },
    ],
    ...overrides,
    app: {
      requestedAccessScopes: [
        { handle: "write_products" },
        { handle: "write_files" },
      ],
      ...overrides.app,
    },
  };
}

describe("buildShopifyAuthorizationStatus", () => {
  it("classifies an unconfigured scope as missing even if it was granted before", () => {
    const result = buildShopifyAuthorizationStatus(
      installation({
        app: {
          requestedAccessScopes: [{ handle: "write_products" }],
        },
      }),
      SHOP_DOMAIN,
      123,
    );

    expect(result).toEqual({
      shopDomain: SHOP_DOMAIN,
      status: "missing",
      scopes: {
        missing: ["write_files"],
        requested: [],
        granted: ["write_products"],
      },
      authorizationUrl: null,
      checkedAt: 123,
    });
  });

  it("partitions and deduplicates required scopes awaiting approval", () => {
    const result = buildShopifyAuthorizationStatus(
      installation({
        accessScopes: [
          { handle: "WRITE_PRODUCTS" },
          { handle: "write_products" },
          { handle: "read_products" },
          { handle: "read_files" },
        ],
        app: {
          requestedAccessScopes: [
            { handle: "write_files" },
            { handle: "WRITE_PRODUCTS" },
            { handle: "write_files" },
            { handle: "read_products" },
          ],
        },
      }),
      SHOP_DOMAIN,
    );

    expect(result.status).toBe("requested");
    expect(result.scopes.missing).toEqual([]);
    expect(result.scopes.requested).toEqual(["write_files"]);
    expect(result.scopes.granted).toEqual(["write_products"]);
    expect(result.authorizationUrl).toBeNull();
    expect([
      ...result.scopes.missing,
      ...result.scopes.requested,
      ...result.scopes.granted,
    ]).toEqual(["write_files", "write_products"]);
  });

  it("returns granted without exposing an authorization URL", () => {
    const result = buildShopifyAuthorizationStatus(
      installation(),
      SHOP_DOMAIN,
    );

    expect(result.status).toBe("granted");
    expect(result.scopes.missing).toEqual([]);
    expect(result.scopes.requested).toEqual([]);
    expect(result.scopes.granted).toEqual([
      "write_products",
      "write_files",
    ]);
    expect(result.authorizationUrl).toBeNull();
  });

  it("distinguishes a missing configuration from pending reauthorization", () => {
    const missing = buildShopifyAuthorizationStatus(
      installation({
        app: {
          requestedAccessScopes: [{ handle: "write_products" }],
        },
      }),
      SHOP_DOMAIN,
    );
    const requested = buildShopifyAuthorizationStatus(
      installation({ accessScopes: [{ handle: "write_products" }] }),
      SHOP_DOMAIN,
    );
    const granted = buildShopifyAuthorizationStatus(
      installation(),
      SHOP_DOMAIN,
    );

    expect(() =>
      requireShopifyAdminScopes(missing, ["write_files"]),
    ).toThrow(/n'est pas publié/);
    expect(() =>
      requireShopifyAdminScopes(requested, ["write_files"]),
    ).toThrow(/ne l'a pas encore approuvé/);
    expect(() =>
      requireShopifyAdminScopes(granted, ["write_files"]),
    ).not.toThrow();
  });
});

describe("normalizeShopDomain", () => {
  it("normalizes valid Shopify handles and domains", () => {
    expect(normalizeShopDomain(" Demo-Store ")).toBe(SHOP_DOMAIN);
    expect(normalizeShopDomain("HTTPS://DEMO-STORE.MYSHOPIFY.COM/")).toBe(
      SHOP_DOMAIN,
    );
    expect(normalizeShopDomain(`${"a".repeat(63)}.myshopify.com`)).toBe(
      `${"a".repeat(63)}.myshopify.com`,
    );
  });

  it.each([
    "example.com",
    "demo-store.myshopify.com.evil.test",
    "-demo.myshopify.com",
    "demo-.myshopify.com",
    `${"a".repeat(64)}.myshopify.com`,
    "demo-store.myshopify.com:443",
    "https://demo-store.myshopify.com/admin",
    "https://user@demo-store.myshopify.com",
    "https://demo-store.myshopify.com?shop=other",
  ])("rejects a malformed or untrusted shop domain: %s", (domain) => {
    expect(() => normalizeShopDomain(domain)).toThrow();
  });
});
