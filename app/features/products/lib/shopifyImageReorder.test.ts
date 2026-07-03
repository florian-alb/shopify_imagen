import { describe, expect, it } from "vitest";

import {
  canReorderShopifyImageOrder,
  reorderShopifyImageOrder,
  shopifyImageIdsMatch,
  shopifyMediaIds,
} from "./shopifyImageReorder";

function image(mediaId: string | null, id?: string) {
  return {
    mediaId,
    id,
    url: `https://example.com/${mediaId ?? id}.png`,
  };
}

describe("shopify image reorder helpers", () => {
  it("extracts media ids with the same fallback as Shopify media helpers", () => {
    expect(
      shopifyMediaIds([image("media-1", "id-1"), image(null, "id-2")]),
    ).toEqual(["media-1", "id-2"]);
  });

  it("requires at least two images with stable media ids before reordering", () => {
    expect(canReorderShopifyImageOrder([image("media-1")])).toBe(false);
    expect(
      canReorderShopifyImageOrder([image("media-1"), image(null)]),
    ).toBe(false);
    expect(
      canReorderShopifyImageOrder([image("media-1"), image(null, "id-2")]),
    ).toBe(true);
  });

  it("compares current and server order by media id", () => {
    expect(
      shopifyImageIdsMatch(
        [image("media-1"), image("media-2")],
        [image("media-1"), image("media-2")],
      ),
    ).toBe(true);
    expect(
      shopifyImageIdsMatch(
        [image("media-1"), image("media-2")],
        [image("media-2"), image("media-1")],
      ),
    ).toBe(false);
  });

  it("moves the dragged image before the hovered image", () => {
    const images = [image("media-1"), image("media-2"), image("media-3")];
    const reordered = reorderShopifyImageOrder(images, "media-3", "media-1");

    expect(shopifyMediaIds(reordered)).toEqual([
      "media-3",
      "media-1",
      "media-2",
    ]);
    expect(shopifyMediaIds(images)).toEqual(["media-1", "media-2", "media-3"]);
  });

  it("keeps the same array when the reorder cannot be applied", () => {
    const images = [image("media-1"), image("media-2")];

    expect(reorderShopifyImageOrder(images, null, "media-2")).toBe(images);
    expect(reorderShopifyImageOrder(images, "media-1", "media-1")).toBe(
      images,
    );
    expect(reorderShopifyImageOrder(images, "missing", "media-1")).toBe(
      images,
    );
  });
});
