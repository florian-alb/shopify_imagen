import { describe, expect, it } from "vitest";

import {
  googleFeedQueryVariables,
  productQueryVariables,
  type GoogleFeedSyncCoordinates,
} from "../../shopify/productQuery";

const coordinates: GoogleFeedSyncCoordinates = {
  google_product_category: {
    namespace: "google",
    key: "google_product_category",
    type: "single_line_text_field",
  },
  gender: {
    namespace: "google",
    key: "gender",
    type: "single_line_text_field",
  },
  age_group: {
    namespace: "google",
    key: "age_group",
    type: "single_line_text_field",
  },
};

describe("Shopify product query variables", () => {
  it("includes every required Google feed metafield coordinate", () => {
    expect(productQueryVariables("gid://shopify/Product/1", coordinates)).toEqual({
      id: "gid://shopify/Product/1",
      categoryNamespace: "google",
      categoryKey: "google_product_category",
      genderNamespace: "google",
      genderKey: "gender",
      ageGroupNamespace: "google",
      ageGroupKey: "age_group",
    });
  });

  it("uses valid placeholders when a metafield is not configured", () => {
    expect(
      googleFeedQueryVariables({
        google_product_category: null,
        gender: null,
        age_group: null,
      }),
    ).toEqual({
      categoryNamespace: "google_feed_missing",
      categoryKey: "missing_category",
      genderNamespace: "google_feed_missing",
      genderKey: "missing_gender",
      ageGroupNamespace: "google_feed_missing",
      ageGroupKey: "missing_age_group",
    });
  });
});
