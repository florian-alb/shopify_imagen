import { envShopDomain, type ShopifyCredentials } from "../shopScope";

function mapImages(product: any) {
  const variantIdsByMediaId = new Map<string, string[]>();
  for (const variant of product.variants?.nodes ?? []) {
    for (const media of variant.media?.nodes ?? []) {
      if (!media?.id || !variant?.id) continue;
      variantIdsByMediaId.set(media.id, [
        ...(variantIdsByMediaId.get(media.id) ?? []),
        variant.id,
      ]);
    }
  }

  const images = (product.media?.nodes ?? [])
    .filter((media: any) => media.mediaContentType === "IMAGE")
    .map((media: any) => ({
      id: media.id,
      mediaId: media.id,
      url: media.image?.url ?? media.preview?.image?.url ?? null,
      altText:
        media.image?.altText ??
        media.preview?.image?.altText ??
        media.alt ??
        null,
      variantIds: variantIdsByMediaId.get(media.id) ?? [],
    }))
    .filter((image: { url: string | null }) => image.url);
  const featuredUrl = product.featuredMedia?.preview?.image?.url;
  if (featuredUrl && !images.some((image: { url: string }) => image.url === featuredUrl)) {
    images.unshift({
      id: null,
      mediaId: null,
      url: featuredUrl,
      altText: product.featuredMedia?.preview?.image?.altText ?? null,
      variantIds: [],
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
    googleProductCategory: product.googleProductCategory?.value ?? null,
    googleProductCategoryDigest:
      product.googleProductCategory?.compareDigest ?? null,
    featuredImageUrl: currentShopifyImages[0]?.url ?? null,
    currentShopifyImages
  };
}

export function mapVariantsForGoogleFeed(product: any) {
  return (product.variants?.nodes ?? []).map((variant: any) => ({
    shopifyVariantId: variant.id,
    title: variant.title ?? "",
    sku: variant.sku ?? "",
    selectedOptions: (variant.selectedOptions ?? []).map(
      (option: { name?: string; value?: string }) => ({
        name: option.name ?? "",
        value: option.value ?? "",
      }),
    ),
    gender: variant.googleGender?.value ?? null,
    genderDigest: variant.googleGender?.compareDigest ?? null,
    ageGroup: variant.googleAgeGroup?.value ?? null,
    ageGroupDigest: variant.googleAgeGroup?.compareDigest ?? null,
  }));
}
