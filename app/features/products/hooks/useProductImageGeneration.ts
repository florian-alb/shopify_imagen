import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

import type { VisualGroupsData } from "../types";
import { useImageTypeSelection } from "./useImageTypeSelection";

export function useProductImageGeneration({
  product,
  availableTypes,
  visualGroupsData,
}: {
  product: Doc<"products"> | null | undefined;
  availableTypes: Doc<"promptTemplates">[];
  visualGroupsData: VisualGroupsData | null | undefined;
}) {
  const navigate = useNavigate();
  const createJob = useMutation(api.jobs.create);
  const [selectedGroupIds, setSelectedGroupIds] = useState<
    Set<Id<"visualGroups">>
  >(new Set());
  const [focusedGroupId, setFocusedGroupId] =
    useState<Id<"visualGroups"> | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageTypeSelection = useImageTypeSelection(availableTypes);

  function openWithGroups(
    groupIds: Id<"visualGroups">[],
    focusGroupId: Id<"visualGroups"> | null,
  ) {
    if (visualGroupsData === undefined) {
      toast.info("Chargement de la configuration des variantes");
      return;
    }
    imageTypeSelection.resetSelection();
    setSelectedGroupIds(new Set(groupIds));
    setFocusedGroupId(focusGroupId);
    setOpen(true);
  }

  function openGenerate() {
    openWithGroups(
      (visualGroupsData?.groups ?? [])
        .filter((group) => group.ready)
        .map((group) => group._id),
      null,
    );
  }

  function openGenerateForGroup(groupId: Id<"visualGroups">) {
    const group = visualGroupsData?.groups.find(
      (candidate) => candidate._id === groupId,
    );
    if (!group?.ready) {
      toast.info("Confirmez d’abord l’image de référence");
      return;
    }
    openWithGroups([groupId], groupId);
  }

  function toggleGroup(groupId: Id<"visualGroups">) {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function generate() {
    if (!product || !imageTypeSelection.selectedTypes.size) return;
    if (visualGroupsData?.config && !selectedGroupIds.size) return;
    setBusy(true);
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(imageTypeSelection.selectedTypes),
        ...(visualGroupsData?.config
          ? { visualGroupIds: Array.from(selectedGroupIds) }
          : {}),
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
    selectedGroupIds,
    focusedGroupId,
    open,
    setOpen,
    busy,
    openGenerate,
    openGenerateForGroup,
    toggleType: imageTypeSelection.toggleType,
    toggleGroup,
    generate,
  };
}
