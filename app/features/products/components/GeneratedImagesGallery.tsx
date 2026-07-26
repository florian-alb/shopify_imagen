import { CheckCheck } from "lucide-react";

import type { LightboxImage } from "@/components/common/Lightbox";
import { BusyIcon, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
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
  reviewingAll,
  onReview,
  onApproveAll,
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
  reviewingAll: boolean;
  onReview: (
    image: Doc<"generatedImages">,
    reviewStatus: "approved" | "rejected",
  ) => void;
  onApproveAll: () => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onDelete: (image: Doc<"generatedImages">) => void;
  onZoom: (images: LightboxImage[], index: number) => void;
}) {
  const itemCount =
    generatedGalleryImages.length + generatingGalleryImages.length;
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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          {pendingCount ? (
            <Button
              type="button"
              size="sm"
              disabled={reviewingAll || Boolean(reviewingImageId)}
              onClick={onApproveAll}
            >
              <BusyIcon busy={reviewingAll} />
              {!reviewingAll ? <CheckCheck data-icon="inline-start" /> : null}
              Tout approuver
            </Button>
          ) : null}
          <StateBadge>{itemCount}</StateBadge>
        </div>
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
                    reviewing={reviewingAll || reviewingImageId === image._id}
                    onPreview={
                      lightboxIndex >= 0
                        ? () => onZoom(lightboxImages, lightboxIndex)
                        : undefined
                    }
                    onReview={(reviewStatus) =>
                      void onReview(image, reviewStatus)
                    }
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
