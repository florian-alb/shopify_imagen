import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Id } from "@/lib/convex";

type ReviewDecision = "approved" | "rejected";

export function useJobImageReview() {
  const reviewImages = useMutation(api.jobs.reviewImages);
  const [reviewing, setReviewing] = useState(false);

  async function setReview(imageIds: Id<"generatedImages">[], reviewStatus: ReviewDecision) {
    if (!imageIds.length) return;

    setReviewing(true);
    try {
      await reviewImages({ imageIds, reviewStatus });
    } catch (error) {
      toast.error("Review update failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setReviewing(false);
    }
  }

  return { reviewing, setReview };
}
