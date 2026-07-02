import type { GalleryReorder } from "@/components/common/Gallery/types";
import type { Doc, Id } from "@/lib/convex";

import { GeneratedImagesGallery } from "./GeneratedImagesGallery";
import { ShopifyImagesGallery } from "./ShopifyImagesGallery";
import type { ShopifyGalleryImage } from "../types";

export function ProductImagesSection({
  readyImagesCount,
  shopifyImages,
  shopifyReorder,
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
  readyImagesCount: number;
  shopifyImages: ShopifyGalleryImage[];
  shopifyReorder?: GalleryReorder;
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
  onZoom: Parameters<typeof ShopifyImagesGallery>[0]["onZoom"];
}) {
  return (
    <>
      <div>
        <p className="text-sm font-medium">
          {readyImagesCount} image
          {readyImagesCount === 1 ? "" : "s"} prete
          {readyImagesCount === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-muted-foreground">
          Seules les images approuvees sont publiees.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <ShopifyImagesGallery
          shopifyImages={shopifyImages}
          onZoom={onZoom}
          reorder={shopifyReorder}
        />
        <GeneratedImagesGallery
          generatedGalleryImages={generatedGalleryImages}
          generatingGalleryImages={generatingGalleryImages}
          approvedCount={approvedCount}
          pendingCount={pendingCount}
          rejectedCount={rejectedCount}
          reviewingImageId={reviewingImageId}
          onReview={onReview}
          onRetouch={onRetouch}
          onDelete={onDelete}
          onZoom={onZoom}
        />
      </section>
    </>
  );
}
