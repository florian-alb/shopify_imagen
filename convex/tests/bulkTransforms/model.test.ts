import { describe, expect, test } from "vitest";

import {
  bulkTransformCanCompletePublication,
  bulkTransformImagePositionIsSelected,
  bulkTransformJobIsTerminal,
  bulkTransformMediaIdFingerprint,
  bulkTransformOwnsFailedUpdate,
  bulkTransformResumeTask,
  cacheBustedShopifyImageUrl,
  classifyBulkTransformSource,
  eligibleShopifyImages,
  normalizeBulkTransformImagePositions,
  replaceCachedShopifyImageUrl,
  selectedCachedShopifyMediaIds,
  selectedBulkTransformImageNodes,
} from "../../bulkTransforms/model";

describe("bulk transform model", () => {
  test("normalizes selected Shopify image positions", () => {
    expect(normalizeBulkTransformImagePositions([3, 1, 3, 2])).toEqual([
      1, 2, 3,
    ]);
    expect(normalizeBulkTransformImagePositions(undefined)).toBeUndefined();
    expect(() => normalizeBulkTransformImagePositions([])).toThrow(
      "Select at least one Shopify image position",
    );
    expect(() => normalizeBulkTransformImagePositions([0])).toThrow(
      "must be integers",
    );
    expect(() => normalizeBulkTransformImagePositions([1.5])).toThrow(
      "must be integers",
    );
  });

  test("keeps legacy jobs on all positions and filters explicit selections", () => {
    expect(bulkTransformImagePositionIsSelected(undefined, 9)).toBe(true);
    expect(bulkTransformImagePositionIsSelected([1, 3], 1)).toBe(true);
    expect(bulkTransformImagePositionIsSelected([1, 3], 2)).toBe(false);
  });

  test("selects positions after removing non-image Shopify media", () => {
    const selected = selectedBulkTransformImageNodes(
      [
        { id: "video", mediaContentType: "VIDEO", status: "READY" },
        { id: "first", mediaContentType: "IMAGE", status: "PROCESSING" },
        { id: "second", mediaContentType: "IMAGE", status: "READY" },
      ],
      [2],
    );

    expect(selected).toEqual([
      {
        media: {
          id: "second",
          mediaContentType: "IMAGE",
          status: "READY",
        },
        position: 1,
      },
    ]);
  });

  test("fingerprints the exact cached media selected at each position", () => {
    const images = [
      { mediaId: null, url: "https://cdn.shopify.com/placeholder.jpg" },
      {
        mediaId: "gid://shopify/MediaImage/first",
        url: "https://cdn.shopify.com/first.jpg",
      },
      {
        mediaId: "gid://shopify/MediaImage/second",
        url: "https://cdn.shopify.com/second.jpg",
      },
    ];
    const selected = selectedCachedShopifyMediaIds(images, [2]);
    expect(selected).toEqual(["gid://shopify/MediaImage/second"]);
    expect(bulkTransformMediaIdFingerprint(selected)).not.toBe(
      bulkTransformMediaIdFingerprint(["gid://shopify/MediaImage/first"]),
    );
  });

  test("detects a live Shopify reorder against the cached selection", () => {
    const cachedIds = selectedCachedShopifyMediaIds(
      [
        {
          mediaId: "gid://shopify/MediaImage/a",
          url: "https://cdn.shopify.com/a.jpg",
        },
        {
          mediaId: "gid://shopify/MediaImage/b",
          url: "https://cdn.shopify.com/b.jpg",
        },
      ],
      [1],
    );
    const liveIds = selectedBulkTransformImageNodes(
      [
        { id: "gid://shopify/MediaImage/b", mediaContentType: "IMAGE" },
        { id: "gid://shopify/MediaImage/a", mediaContentType: "IMAGE" },
      ],
      [1],
    ).map(({ media }) => media.id);

    expect(bulkTransformMediaIdFingerprint(liveIds)).not.toBe(
      bulkTransformMediaIdFingerprint(cachedIds),
    );
  });

  test("selects only stable Shopify MediaImage entries", () => {
    expect(
      eligibleShopifyImages([
        {
          id: "gid://shopify/MediaImage/1",
          url: "https://cdn.shopify.com/image-1.jpg",
          altText: "Face",
        },
        {
          mediaId: "gid://shopify/Video/2",
          url: "https://cdn.shopify.com/video.mp4",
        },
        { id: null, url: "https://cdn.shopify.com/featured.jpg" },
        {
          mediaId: "gid://shopify/MediaImage/3",
          url: "https://cdn.shopify.com/image-3.jpg",
        },
      ]),
    ).toEqual([
      {
        mediaId: "gid://shopify/MediaImage/1",
        url: "https://cdn.shopify.com/image-1.jpg",
        altText: "Face",
        position: 0,
      },
      {
        mediaId: "gid://shopify/MediaImage/3",
        url: "https://cdn.shopify.com/image-3.jpg",
        altText: null,
        position: 1,
      },
    ]);
  });

  test("updates only the targeted cached image URL", () => {
    const images = [
      {
        id: "gid://shopify/MediaImage/1",
        mediaId: "gid://shopify/MediaImage/1",
        url: "https://cdn.shopify.com/old.jpg",
        altText: "Produit",
      },
      {
        id: "gid://shopify/MediaImage/2",
        mediaId: "gid://shopify/MediaImage/2",
        url: "https://cdn.shopify.com/untouched.jpg",
      },
    ];
    const result = replaceCachedShopifyImageUrl({
      images,
      mediaId: "gid://shopify/MediaImage/1",
      url: "https://cdn.shopify.com/old.jpg?bulk_v=123",
    });

    expect(result.replaced).toBe(true);
    expect(result.images).toEqual([
      {
        ...images[0],
        url: "https://cdn.shopify.com/old.jpg?bulk_v=123",
        displayUrl: "https://cdn.shopify.com/old.jpg?bulk_v=123",
      },
      images[1],
    ]);
    expect(images[0]?.url).toBe("https://cdn.shopify.com/old.jpg");
  });

  test("recognizes only final job statuses as terminal", () => {
    expect(bulkTransformJobIsTerminal("ready")).toBe(false);
    expect(bulkTransformJobIsTerminal("publishing")).toBe(false);
    expect(bulkTransformJobIsTerminal("completed")).toBe(true);
    expect(bulkTransformJobIsTerminal("partial")).toBe(true);
    expect(bulkTransformJobIsTerminal("failed")).toBe(true);
  });

  test("distinguishes safe publish, recovered publish, and conflict hashes", () => {
    expect(
      classifyBulkTransformSource({
        currentSha256: "source",
        sourceSha256: "source",
        transformedSha256: "mirrored",
      }),
    ).toBe("source");
    expect(
      classifyBulkTransformSource({
        currentSha256: "mirrored",
        sourceSha256: "source",
        transformedSha256: "mirrored",
      }),
    ).toBe("transformed");
    expect(
      classifyBulkTransformSource({
        currentSha256: "merchant-change",
        sourceSha256: "source",
        transformedSha256: "mirrored",
      }),
    ).toBe("conflict");
  });

  test("routes stale retries back through their reset phase", () => {
    expect(
      bulkTransformResumeTask({
        status: "transforming",
        retryPhase: "conflict",
      }),
    ).toEqual({ kind: "reset", phase: "conflict" });
    expect(bulkTransformResumeTask({ status: "transforming" })).toEqual({
      kind: "transform",
    });
    expect(bulkTransformResumeTask({ status: "publishing" })).toEqual({
      kind: "publish",
    });
  });

  test("keeps Shopify truth separate from the browser cache version", () => {
    expect(
      cacheBustedShopifyImageUrl(
        "https://cdn.shopify.com/product.webp?width=800",
        "0123456789abcdef9999",
      ),
    ).toBe(
      "https://cdn.shopify.com/product.webp?width=800&bulk_v=0123456789abcdef",
    );
  });

  test("acknowledges only failures owned by the bulk", () => {
    expect(
      bulkTransformOwnsFailedUpdate({
        updateAcceptedByShopifyInCurrentRun: false,
      }),
    ).toBe(false);
    expect(
      bulkTransformOwnsFailedUpdate({
        fileUpdateAcceptedAt: 123,
        updateAcceptedByShopifyInCurrentRun: false,
      }),
    ).toBe(true);
    expect(
      bulkTransformOwnsFailedUpdate({
        updateAcceptedByShopifyInCurrentRun: true,
      }),
    ).toBe(true);
  });

  test("completes publication only after Shopify reports the transformed file ready", () => {
    expect(
      bulkTransformCanCompletePublication({
        sourceState: "transformed",
        fileStatus: "PROCESSING",
        mediaStatus: "PROCESSING",
      }),
    ).toBe(false);
    expect(
      bulkTransformCanCompletePublication({
        sourceState: "transformed",
        fileStatus: "READY",
        mediaStatus: "READY",
      }),
    ).toBe(true);
    expect(
      bulkTransformCanCompletePublication({
        sourceState: "source",
        fileStatus: "READY",
        mediaStatus: "READY",
      }),
    ).toBe(false);
  });
});
