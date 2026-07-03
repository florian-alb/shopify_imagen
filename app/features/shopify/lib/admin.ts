export type ShopifyProductLike = {
  shopifyProductId: string;
};

export function getShopifyAdminUrl(
  product: ShopifyProductLike | null | undefined,
  storeHandle?: string | null,
) {
  if (!product || !storeHandle) return null;

  const numericId = product.shopifyProductId.split("/").pop();
  if (!numericId) return null;

  return `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`;
}
