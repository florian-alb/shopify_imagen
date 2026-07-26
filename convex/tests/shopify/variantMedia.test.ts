import { describe, expect, it } from "vitest";
import {
  buildVariantMediaUpdates,
  imageForPromptOne,
  promptOneImageType,
  shopifyMediaReadiness,
} from "../../shopify/variantMedia";

describe("buildVariantMediaUpdates", () => {
  it("replaces existing media and assigns the primary image to every variant", () => {
    expect(
      buildVariantMediaUpdates({
        variants: [
          { id: "blue-s", mediaIds: ["old-blue"] },
          { id: "blue-m", mediaIds: ["old-blue", "old-detail"] },
          { id: "blue-l", mediaIds: [] },
        ],
        primaryMediaId: "new-blue",
        replaceExisting: true,
      }),
    ).toEqual([
      { id: "blue-s", mediaId: "new-blue" },
      { id: "blue-m", mediaId: "new-blue" },
      { id: "blue-l", mediaId: "new-blue" },
    ]);
  });

  it("preserves existing media and only fills variants without an image", () => {
    expect(
      buildVariantMediaUpdates({
        variants: [
          { id: "red-s", mediaIds: ["existing-red"] },
          { id: "red-m", mediaIds: [] },
        ],
        primaryMediaId: "new-red",
        replaceExisting: false,
      }),
    ).toEqual([{ id: "red-m", mediaId: "new-red" }]);
  });

  it("replaces multiple existing links even when one is already primary", () => {
    expect(
      buildVariantMediaUpdates({
        variants: [
          {
            id: "white-s",
            mediaIds: ["new-white", "old-white"],
          },
        ],
        primaryMediaId: "new-white",
        replaceExisting: true,
      }),
    ).toEqual([{ id: "white-s", mediaId: "new-white" }]);
  });

  it("skips a variant that already has only the requested primary image", () => {
    expect(
      buildVariantMediaUpdates({
        variants: [{ id: "white-s", mediaIds: ["new-white"] }],
        primaryMediaId: "new-white",
        replaceExisting: true,
      }),
    ).toEqual([]);
  });
});

describe("variant image selection", () => {
  it("selects the prompt 1 image independently of publication order", () => {
    const imageType = promptOneImageType([
      { imageType: "detail", position: 2 },
      { imageType: "side-profile", position: 0 },
      { imageType: "front", position: 1 },
    ]);

    expect(
      imageForPromptOne(
        [
          { id: "published-first", imageType: "front" },
          { id: "prompt-one", imageType: "side-profile" },
        ],
        imageType,
      ),
    ).toEqual({ id: "prompt-one", imageType: "side-profile" });
  });

  it("does not fall back to another published image when prompt 1 is absent", () => {
    expect(
      imageForPromptOne(
        [{ id: "published-first", imageType: "front" }],
        "side-profile",
      ),
    ).toBeUndefined();
  });
});

describe("Shopify media readiness", () => {
  it("waits through uploaded and processing states", () => {
    expect(shopifyMediaReadiness("UPLOADED")).toBe("pending");
    expect(shopifyMediaReadiness("PROCESSING")).toBe("pending");
    expect(shopifyMediaReadiness(undefined)).toBe("pending");
  });

  it("recognizes terminal media states", () => {
    expect(shopifyMediaReadiness("READY")).toBe("ready");
    expect(shopifyMediaReadiness("FAILED")).toBe("failed");
  });
});
