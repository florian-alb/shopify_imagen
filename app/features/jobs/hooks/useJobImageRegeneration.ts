import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Doc, type Id } from "@/lib/convex";

type UseJobImageRegenerationOptions = {
  navigateToJob: (jobId: Id<"generationJobs">) => void;
  onOpen?: () => void;
};

export function useJobImageRegeneration({ navigateToJob, onOpen }: UseJobImageRegenerationOptions) {
  const createJob = useMutation(api.jobs.create);
  const reviewImages = useMutation(api.jobs.reviewImages);
  const [regeneratingId, setRegeneratingId] = useState<Id<"generatedImages"> | null>(null);
  const [regenerationTarget, setRegenerationTarget] = useState<Doc<"generatedImages"> | null>(null);
  const [regenerationInstructions, setRegenerationInstructions] = useState("");

  function openRegeneration(image: Doc<"generatedImages">) {
    onOpen?.();
    setRegenerationInstructions("");
    setRegenerationTarget(image);
  }

  function closeRegeneration() {
    if (!regeneratingId) setRegenerationTarget(null);
  }

  async function regenerate() {
    if (!regenerationTarget) return;

    const image = regenerationTarget;
    setRegeneratingId(image._id);
    try {
      const nextJobId = await createJob({
        productIds: [image.productId],
        selectedImageTypes: [image.imageType],
        forceRegenerate: true,
        regenerationInstructions: regenerationInstructions.trim() || undefined,
      });
      await reviewImages({ imageIds: [image._id], reviewStatus: "rejected" });
      setRegenerationTarget(null);
      setRegenerationInstructions("");
      toast.success(`${image.imageType} regeneration started`, {
        action: {
          label: "View job",
          onClick: () => navigateToJob(nextJobId),
        },
      });
    } catch (error) {
      toast.error("Regeneration failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRegeneratingId(null);
    }
  }

  return {
    regeneratingId,
    regenerationTarget,
    regenerationInstructions,
    setRegenerationInstructions,
    openRegeneration,
    closeRegeneration,
    regenerate,
  };
}
