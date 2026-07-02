import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc } from "@/lib/convex";

export function useProductImageGeneration({
  product,
  availableTypes,
}: {
  product: Doc<"products"> | null | undefined;
  availableTypes: Doc<"promptTemplates">[];
}) {
  const navigate = useNavigate();
  const createJob = useMutation(api.jobs.create);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function openGenerate() {
    const presets = availableTypes.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : availableTypes;
    setSelectedTypes(new Set(defaults.map((type) => type.imageType)));
    setOpen(true);
  }

  function toggleType(type: string) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function generate() {
    if (!product || !selectedTypes.size) return;
    setBusy(true);
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(selectedTypes),
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
    selectedTypes,
    open,
    setOpen,
    busy,
    openGenerate,
    toggleType,
    generate,
  };
}
