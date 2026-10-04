import { publicationTargets } from "../../../../convex/shopify/publicationTargets";
import type { Doc, Id } from "@/lib/convex";
import type { VisualGroupsData, VisualGroupWithRows } from "../types";

export type PublishProductGroup = {
  key: string;
  requiresVariantImage: boolean;
  label: string;
  images: Doc<"generatedImages">[];
  group: VisualGroupWithRows | null;
  member: Doc<"visualProductFamilyMembers"> | null;
};

export function buildPublishProductGroups(
  images: Doc<"generatedImages">[],
  visualGroupsData: VisualGroupsData | null | undefined,
  focusedGroupId: Id<"visualGroups"> | null | undefined,
): PublishProductGroup[] {
  const memberByGroupId = new Map(
    (visualGroupsData?.family?.members ?? []).map((member) => [
      member.groupId,
      member,
    ]),
  );
  const visibleImages = focusedGroupId
    ? images.filter((image) => image.visualGroupId === focusedGroupId)
    : images;
  return publicationTargets(visibleImages).map((target) => {
    const group =
      visualGroupsData?.groups.find(
        (candidate) => candidate._id === target.groupId,
      ) ?? null;
    return {
      key: target.key,
      label: target.variantId ? target.label : (group?.label ?? target.label),
      requiresVariantImage: target.requiresVariantImage,
      images: target.images,
      group,
      member: group ? (memberByGroupId.get(group._id) ?? null) : null,
    };
  });
}
