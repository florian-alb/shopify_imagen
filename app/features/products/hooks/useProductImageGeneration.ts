import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

import type { VisualGroupsData } from "../types";
import { useVariantGenerationSelection } from "./useVariantGenerationSelection";
import { useImageTypeSelection } from "./useImageTypeSelection";
import { canGenerateVisualGroup } from "../lib/visualGroupGeneration";

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
  const [textOnlyGroupIds, setTextOnlyGroupIds] = useState<
    Set<Id<"visualGroups">>
  >(new Set());
  const [focusedGroupId, setFocusedGroupId] =
    useState<Id<"visualGroups"> | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageTypeSelection = useImageTypeSelection(availableTypes);
  const selectedTextOnlyGroupIds = Array.from(textOnlyGroupIds).filter(
    (groupId) => selectedGroupIds.has(groupId),
  );
  const variants = useVariantGenerationSelection({
    open,
    productIds: product ? [product._id] : [],
    selectedImageTypes: Array.from(imageTypeSelection.selectedTypes),
    textOnlyGroupIds: selectedTextOnlyGroupIds,
    ...(visualGroupsData?.config
      ? { visualGroupIds: Array.from(selectedGroupIds) }
      : {}),
  });

  function openWithGroups(
    groupIds: Id<"visualGroups">[],
    focusGroupId: Id<"visualGroups"> | null,
  ) {
    if (visualGroupsData === undefined) {
      toast.info("Chargement de la configuration des variantes");
      return;
    }
    imageTypeSelection.resetSelection();
    variants.resetVariantSelection();
    setSelectedGroupIds(new Set(groupIds));
    setTextOnlyGroupIds(new Set());
    setFocusedGroupId(focusGroupId);
    setOpen(true);
  }

  function openGenerate() {
    openWithGroups(
      (visualGroupsData?.groups ?? [])
        .filter(
          (group) =>
            canGenerateVisualGroup(group) &&
            (!visualGroupsData?.family ||
              visualGroupsData.family.members.some(
                (member) => member.groupId === group._id,
              )),
        )
        .map((group) => group._id),
      null,
    );
  }

  function openGenerateForGroup(groupId: Id<"visualGroups">) {
    const group = visualGroupsData?.groups.find(
      (candidate) => candidate._id === groupId,
    );
    if (!group) return;
    openWithGroups([groupId], groupId);
  }

  function toggleGroupReferences(groupId: Id<"visualGroups">) {
    setTextOnlyGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
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
        variantSelection: variants.variantSelection,
        ...(selectedTextOnlyGroupIds.length
          ? { textOnlyGroupIds: selectedTextOnlyGroupIds }
          : {}),
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
    variants,
    selectedTypes: imageTypeSelection.selectedTypes,
    selectedGroupIds,
    textOnlyGroupIds,
    focusedGroupId,
    open,
    setOpen,
    busy,
    openGenerate,
    openGenerateForGroup,
    toggleType: imageTypeSelection.toggleType,
    toggleGroup,
    toggleGroupReferences,
    generate,
  };
}
