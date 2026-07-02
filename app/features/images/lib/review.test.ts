import { describe, expect, it } from "vitest";

import type { Doc } from "@/lib/convex";

import {
  getReviewStatus,
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
});

describe("generated image state helpers", () => {
  it("returns the same labels and tones used by route badges", () => {
    expect(generatedImageStateLabel(generatedImage())).toBe("To review");
    expect(generatedImageStateTone(generatedImage())).toBe("warning");

    expect(
      generatedImageStateLabel(
        generatedImage({ reviewStatus: "approved" }),
      ),
    ).toBe("Approved");
    expect(
      generatedImageStateTone(generatedImage({ reviewStatus: "approved" })),
    ).toBe("success");

    expect(
      generatedImageStateLabel(generatedImage({ reviewStatus: "rejected" })),
    ).toBe("Rejected");
    expect(
      generatedImageStateTone(generatedImage({ reviewStatus: "rejected" })),
    ).toBe("danger");

    expect(generatedImageStateLabel(generatedImage({ status: "uploaded" }))).toBe(
      "Pushed",
    );
    expect(generatedImageStateTone(generatedImage({ status: "uploaded" }))).toBe(
      "success",
    );

    expect(generatedImageStateLabel(generatedImage({ status: "failed" }))).toBe(
      "Error",
    );
    expect(generatedImageStateTone(generatedImage({ status: "failed" }))).toBe(
      "danger",
    );
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
    ).toEqual({ tone: "warning", label: "2 to review" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 2,
        rejected: 0,
      }),
    ).toEqual({ tone: "success", label: "Approved" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 1,
        rejected: 1,
      }),
    ).toEqual({ tone: "warning", label: "Partial" });

    expect(
      reviewAggregateBadge({
        total: 2,
        pending: 0,
        approved: 0,
        rejected: 2,
      }),
    ).toEqual({ tone: "danger", label: "Rejected" });

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
