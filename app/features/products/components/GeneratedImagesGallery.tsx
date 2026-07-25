import type { LightboxImage } from "@/components/common/Lightbox";
import { StateBadge } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GeneratedImageTile,
  PendingGeneratedImageTile,
} from "@/features/images/components/GeneratedImageTile";
import type { Doc, Id } from "@/lib/convex";

export function GeneratedImagesGallery({
  title = "Images générées",
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
  title?: string;
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
      label: [image.visualGroupLabel, image.imageType]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <StateBadge>{itemCount}</StateBadge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {approvedCount} approuvée{approvedCount === 1 ? "" : "s"} ·{" "}
          {pendingCount} à valider · {rejectedCount} rejetée
          {rejectedCount === 1 ? "" : "s"}
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
                  caption={[image.visualGroupLabel, image.imageType]
                    .filter(Boolean)
                    .join(" · ")}
                  statusLabel="Generation en cours"
                />
              ))}
            </>
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              Aucune image générée.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
