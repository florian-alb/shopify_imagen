import { envShopDomain, type ShopifyCredentials } from "../shopScope";

function mapImages(product: any) {
  const images = (product.media?.nodes ?? [])
    .filter((media: any) => media.mediaContentType === "IMAGE")
    .map((media: any) => ({
      id: media.id,
      mediaId: media.id,
      url: media.image?.url ?? media.preview?.image?.url ?? null,
      altText: media.image?.altText ?? media.preview?.image?.altText ?? media.alt ?? null
    }))
    .filter((image: { url: string | null }) => image.url);
  const featuredUrl = product.featuredMedia?.preview?.image?.url;
  if (featuredUrl && !images.some((image: { url: string }) => image.url === featuredUrl)) {
    images.unshift({
      id: null,
      mediaId: null,
      url: featuredUrl,
      altText: product.featuredMedia?.preview?.image?.altText ?? null
    });
  }
  return images;
}

export function mapProductForUpsert(product: any, credentials: ShopifyCredentials) {
  const currentShopifyImages = mapImages(product);
  return {
    shopId: credentials.shopId,
    adoptLegacy: Boolean(credentials.shopId && credentials.domain === envShopDomain()),
    shopifyProductId: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    shopifyStatus: product.status ?? null,
    tags: product.tags ?? [],
    collections: product.collections?.nodes ?? [],
    options: product.options ?? [],
    variants: product.variants?.nodes ?? [],
    metafields: product.metafields?.nodes ?? [],
    featuredImageUrl: currentShopifyImages[0]?.url ?? null,
    currentShopifyImages
  };
}
