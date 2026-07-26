import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../_generated/dataModel";
import type { ShopifyCredentials } from "../../shopScope";
import { getAccessToken } from "../../shopify/client";

function credentials(
  overrides: Partial<ShopifyCredentials> = {},
): ShopifyCredentials {
  return {
    domain: "merchant-shop.myshopify.com",
    storeHandle: "merchant-shop",
    clientId: "client-id",
    clientSecret: "client-secret",
    productQuery: "status:active",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAccessToken", () => {
  it("uses the stored OAuth token for a saved shop", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAccessToken(
        credentials({
          shopId: "shop-id" as Id<"shops">,
          accessToken: "oauth-token",
        }),
      ),
    ).resolves.toBe("oauth-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never attempts client credentials for a saved shop without OAuth", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAccessToken(
        credentials({
          shopId: "shop-id" as Id<"shops">,
        }),
      ),
    ).rejects.toThrow("doit être autorisée dans Shopify");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves Shopify plain-text errors for legacy client credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "Oauth error shop_not_permitted: Client credentials cannot be performed on this shop.",
          { status: 400 },
        ),
      ),
    );

    await expect(getAccessToken(credentials())).rejects.toThrow(
      "shop_not_permitted",
    );
  });
});
