export type ShopifyMediaLike = {
  id?: string | null;
  mediaId?: string | null;
};

export function shopifyMediaId(image: ShopifyMediaLike) {
  return image.mediaId ?? image.id ?? "";
}
