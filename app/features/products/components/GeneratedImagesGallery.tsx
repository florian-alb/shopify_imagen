import { Gallery } from "@/components/common/Gallery";
import {
  getReviewStatus,
  isReviewable,
} from "@/features/images/lib/review";
import {
  generatedImageStateLabel,
  generatedImageStateTone,
} from "@/features/images/lib/state";
import type { Doc, Id } from "@/lib/convex";

export function GeneratedImagesGallery({
  generatedGalleryImages,
  generatingGalleryImages,
  approvedCount,
  pendingCount,
  rejectedCount,
  reviewingImageId,
  onReview,
  onRetouch,
  onDelete,
  onZoom,
}: {
  generatedGalleryImages: Doc<"generatedImages">[];
  generatingGalleryImages: Doc<"generatedImages">[];
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  reviewingImageId: Id<"generatedImages"> | null;
  onReview: (
    image: Doc<"generatedImages">,
    reviewStatus: "approved" | "rejected",
  ) => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onDelete: (image: Doc<"generatedImages">) => void;
  onZoom: Parameters<typeof Gallery>[0]["onZoom"];
}) {
  return (
    <Gallery
      title="Images generees"
      description={`${approvedCount} approved · ${pendingCount} to review · ${rejectedCount} rejected`}
      items={generatedGalleryImages.map((image) => ({
        id: image._id,
        url: image.storageUrl!,
        label: image.imageType,
        caption: image.imageType,
        retouched: Boolean(image.retouchSourceImageId),
        reviewStatus: getReviewStatus(image),
        statusLabel: generatedImageStateLabel(image),
        statusTone: generatedImageStateTone(image),
        reviewable: isReviewable(image),
        reviewing: reviewingImageId === image._id,
        onApprove: () => void onReview(image, "approved"),
        onReject: () => void onReview(image, "rejected"),
        onRetouch: () => onRetouch(image),
        onDelete: () => onDelete(image),
      }))}
      pendingItems={generatingGalleryImages.map((image) => ({
        id: image._id,
        caption: image.imageType,
        statusLabel: "Generation en cours",
      }))}
      emptyText="Aucune image generee."
      onZoom={onZoom}
    />
  );
}
