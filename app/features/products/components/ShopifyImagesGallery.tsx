import { Gallery } from "@/components/common/Gallery";
import { shopifyMediaId } from "@/features/shopify/lib/media";
import type { GalleryReorder } from "@/components/common/Gallery/types";
import type { Doc } from "@/lib/convex";

import type { ShopifyGalleryImage } from "../types";
import { indexRetouchablePublishedImages } from "../lib/publishedImageRetouch";

export function ShopifyImagesGallery({
  shopifyImages,
  generatedImages,
  description = "Glissez pour changer l'ordre Shopify. La premiere image sert de reference produit.",
  onZoom,
  onRetouch,
  reorder,
}: {
  shopifyImages: ShopifyGalleryImage[];
  generatedImages: Doc<"generatedImages">[];
  description?: string;
  onZoom: Parameters<typeof Gallery>[0]["onZoom"];
  onRetouch: (image: Doc<"generatedImages">) => void;
  reorder?: GalleryReorder;
}) {
  const retouchableImages = indexRetouchablePublishedImages(generatedImages);

  return (
    <Gallery
      title="Images Shopify"
      description={description}
      items={shopifyImages.map((image) => {
        const mediaId = shopifyMediaId(image);
        const retouchTarget = retouchableImages.get(mediaId);

        return {
          id: mediaId,
          url: image.displayUrl ?? image.url,
          label: image.altText ?? "Shopify product",
          onRetouch: retouchTarget
            ? () => onRetouch(retouchTarget)
            : undefined,
        };
      })}
      emptyText="Aucune image Shopify."
      onZoom={onZoom}
      reorder={reorder}
    />
  );
}
