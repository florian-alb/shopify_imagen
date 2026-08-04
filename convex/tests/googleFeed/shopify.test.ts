import { describe, expect, it, vi } from "vitest"

import {
  GOOGLE_FEED_METAFIELDS_SET_MUTATION,
  GOOGLE_FEED_VERIFY_METAFIELDS_QUERY,
} from "../../googleFeed/graphql"
import {
  parseGoogleProductTaxonomy,
  publishGoogleFeedBatch,
  withShopifyRetry,
  type ClaimedGoogleFeedDraft,
  type ShopifyGraphqlTransport,
} from "../../googleFeed/shopify"

const draft: ClaimedGoogleFeedDraft = {
  draftId: "draft-1",
  runItemId: "item-1",
  ownerId: "gid://shopify/ProductVariant/1",
  ownerType: "PRODUCTVARIANT",
  attribute: "age_group",
  namespace: "google",
  key: "age_group",
  type: "single_line_text_field",
  currentValue: null,
  currentDigest: null,
  proposedValue: "adult",
}

describe("Google feed Shopify publication", () => {
  it("uses compare-and-set, then confirms the remote value by rereading it", async () => {
    const transport = vi.fn<ShopifyGraphqlTransport>(async (query, variables) => {
      if (query === GOOGLE_FEED_METAFIELDS_SET_MUTATION) {
        expect(variables).toMatchObject({
          metafields: [
            {
              ownerId: draft.ownerId,
              compareDigest: null,
              value: "adult",
            },
          ],
        })
        return {
          metafieldsSet: {
            metafields: [],
            userErrors: [],
          },
        }
      }
      expect(query).toBe(GOOGLE_FEED_VERIFY_METAFIELDS_QUERY)
      return {
        nodes: [
          {
            __typename: "ProductVariant",
            id: draft.ownerId,
            googleFeedValue: { value: "adult", compareDigest: "digest-2" },
          },
        ],
      }
    })

    await expect(publishGoogleFeedBatch([draft], transport)).resolves.toEqual([
      {
        draftId: "draft-1",
        runItemId: "item-1",
        status: "confirmed",
        value: "adult",
        digest: "digest-2",
      },
    ])
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it("maps Shopify user errors to the rejected row and never verifies it", async () => {
    const transport = vi.fn<ShopifyGraphqlTransport>().mockResolvedValue({
      metafieldsSet: {
        metafields: null,
        userErrors: [
          {
            field: ["metafields", "0", "compareDigest"],
            message: "The metafield has changed.",
            code: "STALE_OBJECT",
            elementIndex: 0,
          },
        ],
      },
    })
    const result = await publishGoogleFeedBatch([draft], transport)
    expect(result[0]).toMatchObject({
      status: "failed",
      error: "The metafield has changed.",
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("reports a verification mismatch as a failure", async () => {
    const transport = vi.fn<ShopifyGraphqlTransport>(async (query) =>
      query === GOOGLE_FEED_METAFIELDS_SET_MUTATION
        ? { metafieldsSet: { metafields: [], userErrors: [] } }
        : {
            nodes: [
              {
                id: draft.ownerId,
                googleFeedValue: { value: "kids", compareDigest: "remote" },
              },
            ],
          },
    )
    const result = await publishGoogleFeedBatch([draft], transport)
    expect(result[0]).toMatchObject({ status: "failed" })
  })

  it("retries a throttled transport with a bounded backoff", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("429 throttled"))
      .mockResolvedValue("ok")
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(withShopifyRetry(operation, { sleep })).resolves.toBe("ok")
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(250)
  })
})

describe("Google product taxonomy", () => {
  it("parses official id-label rows and ignores comments", () => {
    expect(
      parseGoogleProductTaxonomy(
        "# Google_Product_Taxonomy_Version: 2021-09-21\n1 - Animals & Pet Supplies\n123 - Apparel & Accessories > Shoes\ninvalid",
      ),
    ).toEqual([
      { id: "1", label: "Animals & Pet Supplies" },
      { id: "123", label: "Apparel & Accessories > Shoes" },
    ])
  })
})
