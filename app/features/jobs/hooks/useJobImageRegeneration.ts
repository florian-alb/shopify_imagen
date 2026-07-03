import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api, type Doc, type Id } from "@/lib/convex";

type UseJobImageRegenerationOptions = {
  onOpen?: () => void;
};

export function useJobImageRegeneration({ onOpen }: UseJobImageRegenerationOptions) {
  const regenerateImage = useMutation(api.jobs.regenerateImage);
  const [regeneratingId, setRegeneratingId] =
    useState<Id<"generatedImages"> | null>(null);
  const [regenerationTarget, setRegenerationTarget] =
    useState<Doc<"generatedImages"> | null>(null);
  const [regenerationInstructions, setRegenerationInstructions] = useState("");

  function openRegeneration(image: Doc<"generatedImages">) {
    onOpen?.();
    setRegenerationInstructions("");
    setRegenerationTarget(image);
  }

  function closeRegeneration() {
    if (!regeneratingId) setRegenerationTarget(null);
  }

  async function regenerateImageInPlace(
    image: Doc<"generatedImages">,
    instructions?: string,
  ) {
    setRegeneratingId(image._id);
    try {
      await regenerateImage({
        imageId: image._id,
        regenerationInstructions: instructions?.trim() || undefined,
      });
      setRegenerationTarget(null);
      setRegenerationInstructions("");
      toast.success(`${image.imageType} regeneration started`, {
        description: "The existing image slot will update in this job.",
      });
    } catch (error) {
      toast.error("Regeneration failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRegeneratingId(null);
    }
  }

  async function regenerate() {
    if (!regenerationTarget) return;
    await regenerateImageInPlace(regenerationTarget, regenerationInstructions);
  }

  async function retryImage(image: Doc<"generatedImages">) {
    await regenerateImageInPlace(image);
  }

  return {
    regeneratingId,
    regenerationTarget,
    regenerationInstructions,
    setRegenerationInstructions,
    openRegeneration,
    closeRegeneration,
    regenerate,
    retryImage,
  };
}
