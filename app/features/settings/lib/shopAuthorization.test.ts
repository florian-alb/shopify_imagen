import { describe, expect, it } from "vitest";
import type { ShopifyAuthorizationStatus, ShopRow } from "../types";
import {
  authorizationMatchesShop,
  authorizationRelevantScopes,
  CLOSED_SHOP_AUTHORIZATION_STATE,
  parseShopifyAuthorizationStatus,
  shopAuthorizationReducer,
} from "./shopAuthorization";

const shop: ShopRow = {
  _id: "shop-id" as ShopRow["_id"],
  domain: "ajcna0-3c.myshopify.com",
  storeHandle: "ajcna0-3c",
  name: "Maison Patine",
  productQuery: "status:active",
  hasClientCredentials: true,
  isActive: true,
  source: "database",
};

function authorization(
  status: ShopifyAuthorizationStatus["status"],
): ShopifyAuthorizationStatus {
  return {
    shopDomain: shop.domain,
    status,
    scopes: {
      missing: status === "missing" ? ["write_files"] : [],
      requested: status === "requested" ? ["write_files"] : [],
      granted: status === "granted"
        ? ["write_files", "write_products"]
        : ["write_products"],
    },
    authorizationUrl:
      status === "requested"
        ? "https://ajcna0-3c.myshopify.com/admin/api_permissions/123/redirect"
        : null,
    checkedAt: 1_786_000_000_000,
  };
}

describe("shop authorization state", () => {
  it("keeps opening Shopify separate from a granted result", () => {
    const required = shopAuthorizationReducer(
      CLOSED_SHOP_AUTHORIZATION_STATE,
      {
        type: "check_succeeded",
        shop,
        authorization: authorization("requested"),
        safeAuthorizationUrl:
          "https://ajcna0-3c.myshopify.com/admin/api_permissions/123/redirect",
      },
    );
    expect(required.status).toBe("authorization_required");

    const waiting = shopAuthorizationReducer(required, {
      type: "authorization_opened",
    });
    expect(waiting.status).toBe("awaiting_approval");
  });

  it("marks access as granted only after a granted verification", () => {
    const result = shopAuthorizationReducer(
      { status: "checking", shop },
      {
        type: "check_succeeded",
        shop,
        authorization: authorization("granted"),
        safeAuthorizationUrl: null,
      },
    );
    expect(result.status).toBe("granted");
  });

  it("does not enter the waiting state without a safe launch URL", () => {
    const missing = shopAuthorizationReducer(
      CLOSED_SHOP_AUTHORIZATION_STATE,
      {
        type: "check_succeeded",
        shop,
        authorization: authorization("missing"),
        safeAuthorizationUrl: null,
      },
    );
    expect(
      shopAuthorizationReducer(missing, { type: "authorization_opened" }),
    ).toBe(missing);
  });

  it("never exposes an authorization URL for an unpublished scope", () => {
    const missing = shopAuthorizationReducer(
      CLOSED_SHOP_AUTHORIZATION_STATE,
      {
        type: "check_succeeded",
        shop,
        authorization: authorization("missing"),
        safeAuthorizationUrl:
          "https://ajcna0-3c.myshopify.com/admin/api_permissions/123/redirect",
      },
    );
    expect(missing).toMatchObject({
      status: "authorization_required",
      safeAuthorizationUrl: null,
    });
  });

  it("closes the dialog from every state", () => {
    expect(
      shopAuthorizationReducer(
        { status: "error", shop, message: "Erreur" },
        { type: "closed" },
      ),
    ).toEqual(CLOSED_SHOP_AUTHORIZATION_STATE);
  });

  it("matches authorization responses to the selected shop", () => {
    expect(authorizationMatchesShop(authorization("granted"), shop)).toBe(true);
    expect(
      authorizationMatchesShop(
        { ...authorization("granted"), shopDomain: "other.myshopify.com" },
        shop,
      ),
    ).toBe(false);
  });

  it("rejects malformed authorization payloads", () => {
    expect(parseShopifyAuthorizationStatus(authorization("requested"))).toEqual(
      authorization("requested"),
    );
    expect(() =>
      parseShopifyAuthorizationStatus({
        ...authorization("requested"),
        status: "unknown",
      }),
    ).toThrow("Réponse d'autorisation Shopify invalide.");
    expect(() =>
      parseShopifyAuthorizationStatus({
        ...authorization("requested"),
        authorizationUrl: null,
      }),
    ).toThrow("Réponse d'autorisation Shopify invalide.");
    expect(() =>
      parseShopifyAuthorizationStatus({
        ...authorization("granted"),
        authorizationUrl:
          "https://ajcna0-3c.myshopify.com/admin/api_permissions/123/redirect",
      }),
    ).toThrow("Réponse d'autorisation Shopify invalide.");
    expect(() =>
      parseShopifyAuthorizationStatus({
        ...authorization("granted"),
        checkedAt: 1e308,
      }),
    ).toThrow("Réponse d'autorisation Shopify invalide.");
    expect(() =>
      parseShopifyAuthorizationStatus({
        ...authorization("requested"),
        scopes: {
          missing: ["write_files"],
          requested: ["write_files"],
          granted: ["write_products"],
        },
      }),
    ).toThrow("Réponse d'autorisation Shopify invalide.");
  });

  it("shows the scope partition that matches the authorization status", () => {
    expect(authorizationRelevantScopes(authorization("missing"))).toEqual([
      "write_files",
    ]);
    expect(authorizationRelevantScopes(authorization("requested"))).toEqual([
      "write_files",
    ]);
    expect(authorizationRelevantScopes(authorization("granted"))).toEqual([
      "write_files",
      "write_products",
    ]);
  });
});
