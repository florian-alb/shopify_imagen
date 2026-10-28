export type ShopifyProductLike = {
  shopifyProductId: string;
  shopifyDeletedAt?: number;
};

export function getShopifyAdminUrl(
  product: ShopifyProductLike | null | undefined,
  storeHandle?: string | null,
) {
  if (!product || !storeHandle || product.shopifyDeletedAt != null) return null;

  const numericId = product.shopifyProductId.split("/").pop();
  if (!numericId) return null;

  return `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`;
}
