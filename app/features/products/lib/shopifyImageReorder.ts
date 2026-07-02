import { shopifyMediaId } from "../../shopify/lib/media";
import type { ShopifyGalleryImage } from "../types";

export function shopifyMediaIds(images: ShopifyGalleryImage[]) {
  return images.map(shopifyMediaId);
}

export function canReorderShopifyImageOrder(images: ShopifyGalleryImage[]) {
  return images.length > 1 && images.every((image) => shopifyMediaId(image));
}

export function shopifyImageIdsMatch(
  left: ShopifyGalleryImage[],
  right: ShopifyGalleryImage[],
) {
  const leftIds = shopifyMediaIds(left);
  const rightIds = shopifyMediaIds(right);

  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}

export function reorderShopifyImageOrder(
  images: ShopifyGalleryImage[],
  draggedMediaId: string | null | undefined,
  overMediaId: string,
) {
  if (!draggedMediaId || draggedMediaId === overMediaId) return images;

  const from = images.findIndex(
    (image) => shopifyMediaId(image) === draggedMediaId,
  );
  const to = images.findIndex((image) => shopifyMediaId(image) === overMediaId);

  if (from === -1 || to === -1) return images;

  const next = [...images];
  const [draggedImage] = next.splice(from, 1);
  next.splice(to, 0, draggedImage);

  return next;
}
