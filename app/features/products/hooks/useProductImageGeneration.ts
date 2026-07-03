import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc } from "@/lib/convex";
import { useImageTypeSelection } from "./useImageTypeSelection";

export function useProductImageGeneration({
  product,
  availableTypes,
}: {
  product: Doc<"products"> | null | undefined;
  availableTypes: Doc<"promptTemplates">[];
}) {
  const navigate = useNavigate();
  const createJob = useMutation(api.jobs.create);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageTypeSelection = useImageTypeSelection(availableTypes);

  function openGenerate() {
    imageTypeSelection.resetSelection();
    setOpen(true);
  }

  async function generate() {
    if (!product || !imageTypeSelection.selectedTypes.size) return;
    setBusy(true);
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(imageTypeSelection.selectedTypes),
        forceRegenerate: true,
      });
      setOpen(false);
      toast.success("Background generation started", {
        description: "Progress updates live on product.",
        action: {
          label: "View job",
          onClick: () =>
            void navigate({ to: "/jobs/$jobId", params: { jobId } }),
        },
      });
    } catch (jobError) {
      toast.error("Failed start generation", {
        description: errorMessage(jobError),
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    selectedTypes: imageTypeSelection.selectedTypes,
    open,
    setOpen,
    busy,
    openGenerate,
    toggleType: imageTypeSelection.toggleType,
    generate,
  };
}
