import { CheckCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { LightboxImage } from "@/components/common/Lightbox";
import { BusyIcon, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GeneratedImageTile,
  PendingGeneratedImageTile,
} from "@/features/images/components/GeneratedImageTile";
import type { Doc, Id } from "@/lib/convex";
import { generatedImageStateLabel } from "@/features/images/lib/state";

export function GeneratedImagesGallery({
  title = "Images générées",
  generatedGalleryImages,
  generatingGalleryImages,
  unavailableGalleryImages = [],
  emptyText = "Aucune image générée.",
  pendingCount,
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
  unavailableGalleryImages?: Doc<"generatedImages">[];
  emptyText?: string;
  pendingCount: number;
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
    generatedGalleryImages.length + generatingGalleryImages.length + unavailableGalleryImages.length;
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
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          {pendingCount ? (
            <Button
              type="button"
              size="sm"
              aria-label={`Approuver les ${pendingCount} en attente de cette vue`}
              disabled={reviewingAll || Boolean(reviewingImageId)}
              onClick={onApproveAll}
            >
              <BusyIcon busy={reviewingAll} />
              {!reviewingAll ? <CheckCheck data-icon="inline-start" /> : null}
              <span>Approuver les {pendingCount} en attente<span className="hidden sm:inline"> de cette vue</span></span>
            </Button>
          ) : null}
          <StateBadge>{itemCount}</StateBadge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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
                  statusLabel={generatedImageStateLabel(image)}
                />
              ))}
              {unavailableGalleryImages.map(image => <div key={image._id} className="space-y-2">
                <GeneratedImageTile image={image} onDelete={() => onDelete(image)} />
                {image.jobId && <Button variant="outline" size="sm" asChild><Link to="/jobs/$jobId" params={{ jobId: image.jobId }}>Voir le traitement{image.status === "failed" ? " en échec" : ""}</Link></Button>}
              </div>)}
            </>
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground" role="status">
              {emptyText}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
