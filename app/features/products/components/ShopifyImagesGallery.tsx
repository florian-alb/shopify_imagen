import { Gallery } from "@/components/common/Gallery";
import { shopifyMediaId } from "@/features/shopify/lib/media";
import type { GalleryReorder } from "@/components/common/Gallery/types";

import type { ShopifyGalleryImage } from "../types";

export function ShopifyImagesGallery({
  shopifyImages,
  onZoom,
  reorder,
}: {
  shopifyImages: ShopifyGalleryImage[];
  onZoom: Parameters<typeof Gallery>[0]["onZoom"];
  reorder?: GalleryReorder;
}) {
  return (
    <Gallery
      title="Images Shopify"
      description="Glissez pour changer l'ordre Shopify. La premiere image sert de reference produit."
      items={shopifyImages.map((image) => ({
        id: shopifyMediaId(image),
        url: image.displayUrl ?? image.url,
        label: image.altText ?? "Shopify product",
      }))}
      emptyText="Aucune image Shopify."
      onZoom={onZoom}
      reorder={reorder}
    />
  );
}
