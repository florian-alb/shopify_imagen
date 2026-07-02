import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

export function useProductImageReview() {
  const reviewImages = useMutation(api.jobs.reviewImages);
  const [reviewingImageId, setReviewingImageId] =
    useState<Id<"generatedImages"> | null>(null);

  async function setImageReview(
    image: Doc<"generatedImages">,
    reviewStatus: "approved" | "rejected",
  ) {
    setReviewingImageId(image._id);
    try {
      await reviewImages({ imageIds: [image._id], reviewStatus });
    } catch (reviewError) {
      toast.error("Review update failed", {
        description: errorMessage(reviewError),
      });
    } finally {
      setReviewingImageId(null);
    }
  }

  return {
    reviewingImageId,
    setImageReview,
  };
}
