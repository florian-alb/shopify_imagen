import { getReviewStatus, isPushReady } from "../../images/lib/review";
import type { Doc } from "../../../lib/convex";
import type { VisualGroupWithRows } from "../types";

export type VisualProductStatus =
  | "needs_reference"
  | "ready_to_generate"
  | "generating"
  | "needs_review"
  | "ready_to_publish"
  | "published";

export type VisualProductViewModel = {
  group: VisualGroupWithRows;
  member: Doc<"visualProductFamilyMembers"> | null;
  title: string;
  status: VisualProductStatus;
  images: Doc<"generatedImages">[];
  primaryImageUrl: string | null;
  generatedCount: number;
  publishableCount: number;
  uploadedCount: number;
  pendingReviewCount: number;
};

export const visualProductStatusLabels: Record<VisualProductStatus, string> = {
  needs_reference: "Référence requise",
  ready_to_generate: "Prête à générer",
  generating: "Génération en cours",
  needs_review: "À valider",
  ready_to_publish: "Prête à publier",
  published: "Publiée",
};

export const visualProductStatusTones: Record<
  VisualProductStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  needs_reference: "warning",
  ready_to_generate: "neutral",
  generating: "warning",
  needs_review: "warning",
  ready_to_publish: "success",
  published: "success",
};

export function createVisualProductViewModels(args: {
  parentTitle: string;
  groups: VisualGroupWithRows[];
  members: Doc<"visualProductFamilyMembers">[];
  images: Doc<"generatedImages">[];
}): VisualProductViewModel[] {
  const memberByGroupId = new Map(
    args.members.map((member) => [member.groupId, member]),
  );

  return args.groups.map((group) => {
    const images = args.images.filter(
      (image) => image.visualGroupId === group._id,
    );
    const member = memberByGroupId.get(group._id) ?? null;
    const generatedImages = images.filter(
      (image) => Boolean(image.storageUrl) && !image.activeRetryImageId,
    );
    const publishableImages = images.filter(isPushReady);
    const newlyPublishableImages = publishableImages.filter(
      (image) => image.status === "generated",
    );
    const uploadedImages = images.filter(
      (image) => image.status === "uploaded",
    );
    const pendingReviewImages = generatedImages.filter(
      (image) =>
        image.status === "generated" && getReviewStatus(image) !== "approved",
    );
    const generating = images.some(
      (image) => image.status === "queued" || image.status === "generating",
    );
    const reference = group.references.find((item) => item.confirmed);
    const primaryGeneratedImage =
      newlyPublishableImages[0] ?? uploadedImages[0] ?? generatedImages[0];

    let status: VisualProductStatus;
    if (generating) status = "generating";
    else if (newlyPublishableImages.length) status = "ready_to_publish";
    else if (pendingReviewImages.length) status = "needs_review";
    else if (member || uploadedImages.length) status = "published";
    else if (group.ready) status = "ready_to_generate";
    else status = "needs_reference";

    return {
      group,
      member,
      title: member?.title ?? `${args.parentTitle} — ${group.label}`,
      status,
      images,
      primaryImageUrl:
        primaryGeneratedImage?.storageUrl ??
        reference?.referenceUrl ??
        group.references[0]?.referenceUrl ??
        null,
      generatedCount: generatedImages.length,
      publishableCount: publishableImages.length,
      uploadedCount: uploadedImages.length,
      pendingReviewCount: pendingReviewImages.length,
    };
  });
}
