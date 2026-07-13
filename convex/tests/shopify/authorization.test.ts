import { describe, expect, it } from "vitest";

import { normalizeShopDomain } from "../../shopScope";
import {
  buildShopifyAuthorizationStatus,
  requireShopifyAdminScopes,
  type ShopifyAuthorizationInstallation,
  validateShopifyAuthorizationUrl,
} from "../../shopify/authorization";

const SHOP_DOMAIN = "demo-store.myshopify.com";
const CLIENT_ID = "client-id-123";
const MANAGED_INSTALL_URL =
  "https://admin.shopify.com/store/demo-store/oauth/install?client_id=client-id-123";
const CUSTOM_PERMISSION_URL =
  "https://demo-store.myshopify.com/admin/api_permissions/12345/redirect";

function installation(
  overrides: Omit<Partial<ShopifyAuthorizationInstallation>, "app"> & {
    app?: Partial<ShopifyAuthorizationInstallation["app"]>;
  } = {},
): ShopifyAuthorizationInstallation {
  return {
    launchUrl: CUSTOM_PERMISSION_URL,
    accessScopes: [
      { handle: "write_products" },
      { handle: "write_files" },
    ],
    ...overrides,
    app: {
      installUrl: MANAGED_INSTALL_URL,
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
      CLIENT_ID,
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
      CLIENT_ID,
    );

    expect(result.status).toBe("requested");
    expect(result.scopes.missing).toEqual([]);
    expect(result.scopes.requested).toEqual(["write_files"]);
    expect(result.scopes.granted).toEqual(["write_products"]);
    expect(result.authorizationUrl).toBe(CUSTOM_PERMISSION_URL);
    expect([
      ...result.scopes.missing,
      ...result.scopes.requested,
      ...result.scopes.granted,
    ]).toEqual(["write_files", "write_products"]);
  });

  it("returns granted without exposing or validating an unused URL", () => {
    const result = buildShopifyAuthorizationStatus(
      installation({
        launchUrl: "javascript:alert(1)",
        app: { installUrl: "https://example.test/install" },
      }),
      SHOP_DOMAIN,
      CLIENT_ID,
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

  it("prefers the installation permission URL and keeps App.installUrl as fallback", () => {
    const requestedAccess = {
      accessScopes: [{ handle: "write_products" }],
    };
    const preferred = buildShopifyAuthorizationStatus(
      installation(requestedAccess),
      SHOP_DOMAIN,
      CLIENT_ID,
    );
    const fallback = buildShopifyAuthorizationStatus(
      installation({
        ...requestedAccess,
        launchUrl: null,
      }),
      SHOP_DOMAIN,
      CLIENT_ID,
    );

    expect(preferred.authorizationUrl).toBe(CUSTOM_PERMISSION_URL);
    expect(fallback.authorizationUrl).toBe(MANAGED_INSTALL_URL);
  });

  it("falls back safely when Shopify changes the installation permission URL", () => {
    const result = buildShopifyAuthorizationStatus(
      installation({
        accessScopes: [{ handle: "write_products" }],
        launchUrl: "https://example.test/launch",
      }),
      SHOP_DOMAIN,
      CLIENT_ID,
    );

    expect(result.authorizationUrl).toBe(MANAGED_INSTALL_URL);
  });

  it("fails closed when Shopify returns no safe authorization URL", () => {
    expect(() =>
      buildShopifyAuthorizationStatus(
        installation({
          accessScopes: [{ handle: "write_products" }],
          launchUrl: "https://example.test/launch",
          app: { installUrl: "https://example.test/install" },
        }),
        SHOP_DOMAIN,
        CLIENT_ID,
      ),
    ).toThrow(/safe authorization URL/);
  });

  it("distinguishes a missing configuration from pending reauthorization", () => {
    const missing = buildShopifyAuthorizationStatus(
      installation({
        app: {
          requestedAccessScopes: [{ handle: "write_products" }],
        },
      }),
      SHOP_DOMAIN,
      CLIENT_ID,
    );
    const requested = buildShopifyAuthorizationStatus(
      installation({ accessScopes: [{ handle: "write_products" }] }),
      SHOP_DOMAIN,
      CLIENT_ID,
    );
    const granted = buildShopifyAuthorizationStatus(
      installation(),
      SHOP_DOMAIN,
      CLIENT_ID,
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

describe("validateShopifyAuthorizationUrl", () => {
  it("accepts only the expected managed-install and custom-app URLs", () => {
    expect(
      validateShopifyAuthorizationUrl(
        MANAGED_INSTALL_URL,
        SHOP_DOMAIN,
        CLIENT_ID,
      ),
    ).toBe(MANAGED_INSTALL_URL);
    expect(
      validateShopifyAuthorizationUrl(
        CUSTOM_PERMISSION_URL,
        SHOP_DOMAIN,
        CLIENT_ID,
      ),
    ).toBe(CUSTOM_PERMISSION_URL);
  });

  it.each([
    "http://admin.shopify.com/store/demo-store/oauth/install?client_id=client-id-123",
    "https://admin.shopify.com.evil.test/store/demo-store/oauth/install?client_id=client-id-123",
    "https://admin.shopify.com/store/other-store/oauth/install?client_id=client-id-123",
    "https://admin.shopify.com:8443/store/demo-store/oauth/install?client_id=client-id-123",
    "https://user:password@admin.shopify.com/store/demo-store/oauth/install?client_id=client-id-123",
    "https://admin.shopify.com/store/demo-store/oauth/install?client_id=wrong-id",
    "https://admin.shopify.com/store/demo-store/oauth/install?client_id=client-id-123&return_to=%2F",
    "https://admin.shopify.com/store/demo-store/oauth/install?client_id=client-id-123#fragment",
    "https://other-store.myshopify.com/admin/api_permissions/12345/redirect",
    "https://demo-store.myshopify.com/admin/api_permissions/12345/redirect?client_id=client-id-123",
    "javascript:alert(1)",
  ])("rejects an unsafe authorization URL: %s", (url) => {
    expect(() =>
      validateShopifyAuthorizationUrl(url, SHOP_DOMAIN, CLIENT_ID),
    ).toThrow();
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
