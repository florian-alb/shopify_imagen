import { describe, expect, it } from "vitest";

import type { ShopifyCredentials } from "../../shopScope";
import {
  buildShopifyOAuthAuthorizationUrl,
  createShopifyOAuthState,
  hashShopifyOAuthState,
  parseShopifyOAuthCallback,
  verifyShopifyOAuthHmac,
} from "../../shopify/oauth";

const credentials: ShopifyCredentials = {
  domain: "demo-store.myshopify.com",
  storeHandle: "demo-store",
  clientId: "client-id",
  clientSecret: "client-secret",
  productQuery: "status:active",
};

async function signedCallbackUrl(state: string) {
  const url = new URL("https://example.convex.site/shopify/oauth/callback");
  url.searchParams.set("code", "authorization-code");
  url.searchParams.set("shop", credentials.domain);
  url.searchParams.set("state", state);
  url.searchParams.set("timestamp", "1783994400");
  const message = Array.from(url.searchParams.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(credentials.clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  url.searchParams.set(
    "hmac",
    Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    ),
  );
  return url;
}

describe("Shopify OAuth", () => {
  it("creates unpredictable state and hashes it before persistence", async () => {
    const first = createShopifyOAuthState();
    const second = createShopifyOAuthState();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(await hashShopifyOAuthState(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashShopifyOAuthState(first)).not.toBe(first);
  });

  it("builds a shop-bound authorization code grant URL", () => {
    const state = "a".repeat(64);
    const result = new URL(
      buildShopifyOAuthAuthorizationUrl(
        credentials,
        state,
        "https://example.convex.site/shopify/oauth/callback",
        ["write_products", "write_files"],
      ),
    );

    expect(result.origin).toBe("https://demo-store.myshopify.com");
    expect(result.pathname).toBe("/admin/oauth/authorize");
    expect(result.searchParams.get("client_id")).toBe("client-id");
    expect(result.searchParams.get("scope")).toBe(
      "write_products,write_files",
    );
    expect(result.searchParams.get("state")).toBe(state);
  });

  it("accepts a signed callback and rejects tampering", async () => {
    const state = "b".repeat(64);
    const callback = await signedCallbackUrl(state);

    expect(
      await verifyShopifyOAuthHmac(callback, credentials.clientSecret),
    ).toBe(true);
    expect(parseShopifyOAuthCallback(callback)).toEqual({
      code: "authorization-code",
      shopDomain: credentials.domain,
      state,
    });

    callback.searchParams.set("shop", "other-store.myshopify.com");
    expect(
      await verifyShopifyOAuthHmac(callback, credentials.clientSecret),
    ).toBe(false);
  });

  it("rejects duplicated security parameters", async () => {
    const callback = await signedCallbackUrl("c".repeat(64));
    callback.searchParams.append("hmac", callback.searchParams.get("hmac")!);

    expect(
      await verifyShopifyOAuthHmac(callback, credentials.clientSecret),
    ).toBe(false);
  });
});
