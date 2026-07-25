import { describe, expect, it } from "vitest";
import { buildVariantMediaPlan } from "../../shopify/variantMedia";

describe("buildVariantMediaPlan", () => {
  it("replaces existing media and assigns the primary image to every variant", () => {
    expect(
      buildVariantMediaPlan({
        variants: [
          { id: "blue-s", mediaIds: ["old-blue"] },
          { id: "blue-m", mediaIds: ["old-blue", "old-detail"] },
          { id: "blue-l", mediaIds: [] },
        ],
        primaryMediaId: "new-blue",
        replaceExisting: true,
      }),
    ).toEqual({
      detach: [
        { variantId: "blue-s", mediaIds: ["old-blue"] },
        {
          variantId: "blue-m",
          mediaIds: ["old-blue", "old-detail"],
        },
      ],
      append: [
        { variantId: "blue-s", mediaIds: ["new-blue"] },
        { variantId: "blue-m", mediaIds: ["new-blue"] },
        { variantId: "blue-l", mediaIds: ["new-blue"] },
      ],
    });
  });

  it("preserves existing media and only fills variants without an image", () => {
    expect(
      buildVariantMediaPlan({
        variants: [
          { id: "red-s", mediaIds: ["existing-red"] },
          { id: "red-m", mediaIds: [] },
        ],
        primaryMediaId: "new-red",
        replaceExisting: false,
      }),
    ).toEqual({
      detach: [],
      append: [{ variantId: "red-m", mediaIds: ["new-red"] }],
    });
  });

  it("does not re-append a primary image that is already attached", () => {
    expect(
      buildVariantMediaPlan({
        variants: [
          {
            id: "white-s",
            mediaIds: ["new-white", "old-white"],
          },
        ],
        primaryMediaId: "new-white",
        replaceExisting: true,
      }),
    ).toEqual({
      detach: [{ variantId: "white-s", mediaIds: ["old-white"] }],
      append: [],
    });
  });
});
