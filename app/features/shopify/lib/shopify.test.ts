import { describe, expect, it } from "vitest";

import { getShopifyAdminUrl } from "./admin";
import { shopifyMediaId } from "./media";

describe("shopifyMediaId", () => {
  it("prefers mediaId, then id, then an empty string", () => {
    expect(shopifyMediaId({ mediaId: "media-1", id: "id-1" })).toBe("media-1");
    expect(shopifyMediaId({ id: "id-1" })).toBe("id-1");
    expect(shopifyMediaId({ mediaId: null, id: null })).toBe("");
  });
});

describe("getShopifyAdminUrl", () => {
  it("builds an admin product URL from a Shopify gid", () => {
    expect(
      getShopifyAdminUrl(
        { shopifyProductId: "gid://shopify/Product/1234567890" },
        "demo-store",
      ),
    ).toBe("https://admin.shopify.com/store/demo-store/products/1234567890");
  });

  it("returns null when the store handle or numeric id is missing", () => {
    expect(
      getShopifyAdminUrl(
        { shopifyProductId: "gid://shopify/Product/1234567890" },
        null,
      ),
    ).toBeNull();
    expect(
      getShopifyAdminUrl({ shopifyProductId: "gid://shopify/Product/" }, "demo"),
    ).toBeNull();
  });
});
