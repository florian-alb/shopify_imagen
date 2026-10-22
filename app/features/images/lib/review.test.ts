import { describe, expect, it } from "vitest";

import type { Doc } from "@/lib/convex";

import {
  canReviewImage,
  getReviewStatus,
  hasImagePushError,
  isImagePushing,
  isPushReady,
  isReviewable,
  reviewAggregateBadge,
} from "./review";
import { generatedImageStateLabel, generatedImageStateTone } from "./state";

function generatedImage(
  overrides: Partial<Doc<"generatedImages">> = {},
): Doc<"generatedImages"> {
  return {
    status: "generated",
    storageUrl: "https://example.com/generated.png",
    ...overrides,
  } as Doc<"generatedImages">;
}

describe("generated image review helpers", () => {
  it("defaults missing review status to pending", () => {
    expect(getReviewStatus(generatedImage())).toBe("pending");
    expect(getReviewStatus(generatedImage({ reviewStatus: "approved" }))).toBe(
      "approved",
    );
  });

  it("recognizes reviewable generated and uploaded images with storage", () => {
    expect(isReviewable(generatedImage())).toBe(true);
    expect(isReviewable(generatedImage({ status: "uploaded" }))).toBe(true);
    expect(isReviewable(generatedImage({ storageUrl: undefined }))).toBe(false);
    expect(isReviewable(generatedImage({ status: "failed" }))).toBe(false);
    expect(
      isReviewable(
        generatedImage({ activeRetryImageId: "retry-image-id" as never }),
      ),
    ).toBe(false);
  });

  it("marks only approved reviewable images as push ready", () => {
    expect(isPushReady(generatedImage({ reviewStatus: "approved" }))).toBe(
      true,
    );
    expect(
      isPushReady(
        generatedImage({ status: "uploaded", reviewStatus: "approved" }),
      ),
    ).toBe(true);
    expect(isPushReady(generatedImage({ reviewStatus: "rejected" }))).toBe(
      false,
    );
    expect(isPushReady(generatedImage({ status: "failed" }))).toBe(false);
  });

  it("keeps queued publication images visible but prevents a second push or review", () => {
    const image = generatedImage({
      reviewStatus: "approved",
      pushRunId: "publish-run" as never,
    });
    expect(isReviewable(image)).toBe(true);
    expect(isImagePushing(image)).toBe(true);
    expect(isPushReady(image)).toBe(false);
    expect(canReviewImage(image)).toBe(false);
    expect(generatedImageStateLabel(image)).toBe("Publication en cours");
    expect(generatedImageStateTone(image)).toBe("warning");
    expect(isImagePushing({ ...image, status: "uploaded" })).toBe(true);
  });

  it("exposes push errors without turning a generated photo into a generation failure", () => {
    const image = generatedImage({
      reviewStatus: "approved",
      pushError: "Shopify unavailable",
    });
    expect(isReviewable(image)).toBe(true);
    expect(hasImagePushError(image)).toBe(true);
    expect(isImagePushing(image)).toBe(false);
    expect(isPushReady(image)).toBe(true);
    expect(generatedImageStateLabel(image)).toBe("Publication en échec");
    expect(generatedImageStateTone(image)).toBe("danger");
    expect(generatedImageStateLabel({ ...image, status: "uploaded" })).toBe("Publiée · erreur");
    expect(generatedImageStateLabel({ ...image, pushError: undefined, status: "uploaded" })).toBe("Publiée");
  });
});

describe("generated image state helpers", () => {
  it("returns the same labels and tones used by route badges", () => {
    expect(generatedImageStateLabel(generatedImage())).toBe("À vérifier");
    expect(generatedImageStateTone(generatedImage())).toBe("warning");

    expect(
      generatedImageStateLabel(
        generatedImage({ reviewStatus: "approved" }),
      ),
    ).toBe("Approuvée");
    expect(
      generatedImageStateTone(generatedImage({ reviewStatus: "approved" })),
    ).toBe("success");

    expect(
      generatedImageStateLabel(generatedImage({ reviewStatus: "rejected" })),
    ).toBe("Rejetée");
    expect(
      generatedImageStateTone(generatedImage({ reviewStatus: "rejected" })),
    ).toBe("danger");

    expect(generatedImageStateLabel(generatedImage({ status: "uploaded" }))).toBe(
      "Publiée",
    );
    expect(generatedImageStateTone(generatedImage({ status: "uploaded" }))).toBe(
      "success",
    );

    expect(
      generatedImageStateLabel(
        generatedImage({
          status: "failed",
          activeRetryImageId: "retry-image-id" as never,
        }),
      ),
    ).toBe("Régénération");
    expect(
      generatedImageStateTone(
        generatedImage({
          status: "failed",
          activeRetryImageId: "retry-image-id" as never,
        }),
      ),
    ).toBe("warning");

    expect(generatedImageStateLabel(generatedImage({ status: "failed" }))).toBe(
      "Échec",
    );
    expect(generatedImageStateTone(generatedImage({ status: "failed" }))).toBe(
      "danger",
    );
  });
  it("keeps non-reviewable generation states explicit", () => {
    expect(generatedImageStateLabel(generatedImage({ status: "canceled" }))).toBe(
      "Annulée",
    );
    expect(generatedImageStateTone(generatedImage({ status: "canceled" }))).toBe(
      "danger",
    );
    expect(
      generatedImageStateLabel(
        generatedImage({ status: "queued", storageUrl: undefined }),
      ),
    ).toBe("En attente");
    expect(
      generatedImageStateTone(
        generatedImage({ status: "queued", storageUrl: undefined }),
      ),
    ).toBe("warning");
  });
});

describe("reviewAggregateBadge", () => {
  it("summarizes pending, approved, partial, rejected, and empty states", () => {
    expect(
      reviewAggregateBadge({
        total: 3,
        pending: 2,
        approved: 1,
        rejected: 0,
      }),
    ).toEqual({ tone: "warning", label: "2 à vérifier" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 2,
        rejected: 0,
      }),
    ).toEqual({ tone: "success", label: "Approuvées" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 1,
        rejected: 1,
      }),
    ).toEqual({ tone: "warning", label: "Partiellement approuvées" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 0,
        rejected: 2,
      }),
    ).toEqual({ tone: "danger", label: "Rejetées" });

    expect(
      reviewAggregateBadge(
        {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
        { emptyLabel: "No images to review" },
      ),
    ).toEqual({ tone: "neutral", label: "No images to review" });
  });
});
