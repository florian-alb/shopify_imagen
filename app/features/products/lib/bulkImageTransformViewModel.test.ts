import { describe, expect, test } from "vitest";

import type { Doc, Id } from "@/lib/convex";
import {
  bulkTransformCanPublish,
  bulkTransformCanCancel,
  bulkTransformCanRetry,
  bulkTransformImagePositionsLabel,
  bulkTransformIsTerminal,
  bulkTransformProgress,
  bulkTransformReadyToPublishCount,
  resolveBulkImagePositionSelection,
  toggleBulkImagePosition,
} from "./bulkImageTransformViewModel";

function job(
  overrides: Partial<Doc<"bulkTransformJobs">> = {},
): Doc<"bulkTransformJobs"> {
  return {
    _id: "bulk-job-1" as Id<"bulkTransformJobs">,
    _creationTime: 1,
    createdByUserId: "user-1" as Id<"users">,
    operation: "flip_horizontal",
    status: "transforming",
    productIds: ["product-1" as Id<"products">],
    seededProductCount: 1,
    seedAttempts: 0,
    seedFailedProducts: 0,
    seededItems: 4,
    totalItems: 4,
    transformedItems: 2,
    transformFailedItems: 1,
    publishedItems: 0,
    publishFailedItems: 0,
    conflictItems: 0,
    skippedItems: 0,
    unsupportedItems: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("bulk image transform view model", () => {
  test("labels explicit and legacy image position selections", () => {
    expect(bulkTransformImagePositionsLabel(undefined)).toBe(
      "Toutes les positions",
    );
    expect(bulkTransformImagePositionsLabel([1])).toBe("Image n°1");
    expect(bulkTransformImagePositionsLabel([1, 3, 5])).toBe(
      "Images n°1, n°3, n°5",
    );
  });

  test("selects every available position by default and supports toggles", () => {
    expect(resolveBulkImagePositionSelection([3, 1, 2], null)).toEqual([
      1, 2, 3,
    ]);
    const withoutSecond = toggleBulkImagePosition([1, 2, 3], null, 2);
    expect(resolveBulkImagePositionSelection([1, 2, 3], withoutSecond)).toEqual(
      [1, 3],
    );
    expect(resolveBulkImagePositionSelection([1, 2], new Set())).toEqual([]);
    expect(resolveBulkImagePositionSelection([1, 2], new Set([1, 99]))).toEqual(
      [1],
    );
  });

  test("reports product inventory progress before image transformation", () => {
    expect(
      bulkTransformProgress(
        job({
          status: "queued",
          productIds: [
            "product-1" as Id<"products">,
            "product-2" as Id<"products">,
          ],
          seededProductCount: 1,
          seedFailedProducts: 1,
        }),
      ),
    ).toMatchObject({
      phase: "seed",
      completed: 1,
      total: 2,
      percent: 50,
      failed: 1,
    });
  });

  test("reports transformation progress", () => {
    expect(bulkTransformProgress(job())).toMatchObject({
      phase: "transform",
      completed: 3,
      total: 4,
      percent: 75,
      failed: 1,
    });
  });

  test("reports publication progress including conflicts", () => {
    expect(
      bulkTransformProgress(
        job({
          status: "publishing",
          transformedItems: 4,
          transformFailedItems: 0,
          publishedItems: 2,
          publishFailedItems: 1,
          conflictItems: 1,
        }),
      ),
    ).toMatchObject({
      phase: "publish",
      completed: 4,
      total: 4,
      percent: 100,
      failed: 2,
    });
  });

  test("publishes only a ready job and recognizes terminal states", () => {
    expect(bulkTransformCanPublish(job({ status: "ready" }))).toBe(true);
    expect(bulkTransformCanPublish(job({ status: "transforming" }))).toBe(
      false,
    );
    expect(bulkTransformIsTerminal("ready")).toBe(false);
    expect(bulkTransformIsTerminal("partial")).toBe(true);
  });

  test("counts only items that are still ready to publish", () => {
    const ready = job({
      status: "ready",
      transformedItems: 8,
      publishedItems: 3,
      publishFailedItems: 1,
      conflictItems: 2,
    });
    expect(bulkTransformReadyToPublishCount(ready)).toBe(2);
    expect(bulkTransformCanPublish(ready)).toBe(true);
  });

  test("aligns cancel and retry actions with durable backend states", () => {
    expect(bulkTransformCanCancel(job({ status: "ready" }))).toBe(true);
    expect(bulkTransformCanCancel(job({ status: "publishing" }))).toBe(false);
    expect(
      bulkTransformCanRetry(
        job({ status: "partial", transformFailedItems: 1 }),
      ),
    ).toBe(true);
    expect(
      bulkTransformCanRetry(
        job({ status: "cancelled", transformFailedItems: 1 }),
      ),
    ).toBe(false);
    expect(
      bulkTransformCanRetry(
        job({
          status: "partial",
          transformFailedItems: 1,
          assetsCleanedAt: 2,
        }),
      ),
    ).toBe(false);
  });
});
