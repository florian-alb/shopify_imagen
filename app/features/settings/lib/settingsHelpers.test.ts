import { describe, expect, it } from "vitest";
import {
  normalizeShopDomain,
  safeShopifyAuthorizationUrl,
  shopHandle,
} from "./settingsHelpers";

describe("Shopify settings helpers", () => {
  it("normalizes only valid myshopify store handles", () => {
    expect(normalizeShopDomain(" AJcna0-3C ")).toBe(
      "ajcna0-3c.myshopify.com",
    );
    expect(
      normalizeShopDomain("https://AJCNA0-3C.myshopify.com/"),
    ).toBe("ajcna0-3c.myshopify.com");
    expect(normalizeShopDomain("HTTPS://AJCNA0-3C.myshopify.com/")).toBe(
      "ajcna0-3c.myshopify.com",
    );
    expect(shopHandle("ajcna0-3c.myshopify.com")).toBe("ajcna0-3c");
  });

  it("rejects arbitrary or malformed domains", () => {
    expect(normalizeShopDomain("example.com")).toBe("");
    expect(normalizeShopDomain("-invalid")).toBe("");
    expect(normalizeShopDomain("invalid-")).toBe("");
    expect(normalizeShopDomain("shop.myshopify.com.evil.test")).toBe("");
    expect(
      normalizeShopDomain("https://ajcna0-3c.myshopify.com/admin/products"),
    ).toBe("");
    expect(
      normalizeShopDomain("https://ajcna0-3c.myshopify.com?shop=other"),
    ).toBe("");
    expect(
      normalizeShopDomain("https://user@ajcna0-3c.myshopify.com"),
    ).toBe("");
    expect(normalizeShopDomain("ajcna0-3c.myshopify.com:443")).toBe("");
    expect(
      normalizeShopDomain("https://ajcna0-3c.myshopify.com:443/"),
    ).toBe("");
    expect(normalizeShopDomain("ftp://ajcna0-3c.myshopify.com")).toBe("");
    expect(normalizeShopDomain("a".repeat(64))).toBe("");
  });

  it("accepts Shopify permission redirects for the expected shop only", () => {
    expect(
      safeShopifyAuthorizationUrl(
        "https://ajcna0-3c.myshopify.com/admin/api_permissions/12345/redirect",
        "ajcna0-3c.myshopify.com",
      ),
    ).toBe(
      "https://ajcna0-3c.myshopify.com/admin/api_permissions/12345/redirect",
    );
    expect(
      safeShopifyAuthorizationUrl(
        "https://other-shop.myshopify.com/admin/api_permissions/12345/redirect",
        "ajcna0-3c.myshopify.com",
      ),
    ).toBeNull();
  });

  it("accepts managed install URLs scoped to the expected Admin store", () => {
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=public-id",
        "ajcna0-3c.myshopify.com",
      ),
    ).toBe(
      "https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=public-id",
    );
  });

  it("accepts only a complete OAuth authorization URL for the expected shop", () => {
    const state = "a".repeat(64);
    const url = new URL(
      "https://ajcna0-3c.myshopify.com/admin/oauth/authorize",
    );
    url.searchParams.set("client_id", "public-id");
    url.searchParams.set("scope", "write_products,write_files");
    url.searchParams.set(
      "redirect_uri",
      "https://example.convex.site/shopify/oauth/callback",
    );
    url.searchParams.set("state", state);

    expect(
      safeShopifyAuthorizationUrl(url.toString(), "ajcna0-3c.myshopify.com"),
    ).toBe(url.toString());

    url.hostname = "other-shop.myshopify.com";
    expect(
      safeShopifyAuthorizationUrl(url.toString(), "ajcna0-3c.myshopify.com"),
    ).toBeNull();
  });

  it("rejects unsafe authorization URLs", () => {
    const shop = "ajcna0-3c.myshopify.com";
    expect(
      safeShopifyAuthorizationUrl(
        "http://admin.shopify.com/store/ajcna0-3c/oauth/install",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com.evil.test/store/ajcna0-3c/oauth/install",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/other-shop/oauth/install",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com:443/store/ajcna0-3c/oauth/install?client_id=public-id",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://user:password@admin.shopify.com/store/ajcna0-3c/oauth/install",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/ajcna0-3c/oauth/install#fragment",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=public-id&return_to=https%3A%2F%2Fevil.test",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store//ajcna0-3c/oauth/install?client_id=public-id",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        "https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=one&client_id=two",
        shop,
      ),
    ).toBeNull();
    expect(
      safeShopifyAuthorizationUrl(
        " https://admin.shopify.com/store/ajcna0-3c/oauth/install?client_id=public-id ",
        shop,
      ),
    ).toBeNull();
  });
});
