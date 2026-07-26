import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

export function useProductImageReview() {
  const reviewImages = useMutation(api.jobs.reviewImages);
  const [reviewingImageId, setReviewingImageId] =
    useState<Id<"generatedImages"> | null>(null);
  const [reviewingAll, setReviewingAll] = useState(false);

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

  async function approveAll(images: Doc<"generatedImages">[]) {
    if (!images.length) return;
    setReviewingAll(true);
    try {
      const result = await reviewImages({
        imageIds: images.map((image) => image._id),
        reviewStatus: "approved",
      });
      toast.success(
        `${result.updated} image${result.updated === 1 ? "" : "s"} approuvée${result.updated === 1 ? "" : "s"}`,
      );
    } catch (reviewError) {
      toast.error("Approbation impossible", {
        description: errorMessage(reviewError),
      });
    } finally {
      setReviewingAll(false);
    }
  }

  return {
    reviewingImageId,
    reviewingAll,
    setImageReview,
    approveAll,
  };
}
