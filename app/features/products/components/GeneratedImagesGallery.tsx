import type { LightboxImage } from "@/components/common/Lightbox";
import { StateBadge } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GeneratedImageTile,
  PendingGeneratedImageTile,
} from "@/features/images/components/GeneratedImageTile";
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
  onZoom: (images: LightboxImage[], index: number) => void;
}) {
  const itemCount = generatedGalleryImages.length + generatingGalleryImages.length;
  const lightboxImages = generatedGalleryImages
    .filter((image) => image.storageUrl)
    .map((image) => ({
      url: image.storageUrl!,
      label: image.imageType,
    }));

  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Images generees</CardTitle>
        <StateBadge>{itemCount}</StateBadge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {approvedCount} approved · {pendingCount} to review · {rejectedCount}{" "}
          rejected
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {itemCount ? (
            <>
              {generatedGalleryImages.map((image) => {
                const lightboxIndex = lightboxImages.findIndex(
                  (item) => item.url === image.storageUrl,
                );

                return (
                  <GeneratedImageTile
                    key={image._id}
                    image={image}
                    reviewing={reviewingImageId === image._id}
                    onPreview={
                      lightboxIndex >= 0
                        ? () => onZoom(lightboxImages, lightboxIndex)
                        : undefined
                    }
                    onReview={(reviewStatus) => void onReview(image, reviewStatus)}
                    onRetouch={() => onRetouch(image)}
                    onDelete={() => onDelete(image)}
                  />
                );
              })}
              {generatingGalleryImages.map((image) => (
                <PendingGeneratedImageTile
                  key={image._id}
                  caption={image.imageType}
                  statusLabel="Generation en cours"
                />
              ))}
            </>
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              Aucune image generee.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
