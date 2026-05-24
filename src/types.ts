export type ProductStatus = "pending" | "exported" | "generating" | "generated" | "attached" | "failed";

export type BaseImageType = "situation" | "closeup" | "texture";

export type FixationType =
  | "multi-fonction"
  | "passe-tringle"
  | "galon-fronceur-crochets-escargot"
  | "oeillets"
  | "plis-flamands-agrafes-flamandes";

export type ImageType = BaseImageType | FixationType;

export interface ShopifyProductOption {
  name?: string | null;
  values?: Array<string | null> | null;
}

export interface ShopifyProductVariant {
  id?: string | number | null;
  title?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

export interface ShopifyMetafield {
  namespace?: string | null;
  key?: string | null;
  value?: unknown;
}

export interface ShopifyImage {
  id?: string | number | null;
  mediaId?: string | number | null;
  url?: string | null;
  src?: string | null;
  altText?: string | null;
}

export interface ShopifyProduct {
  id: string | number;
  title: string;
  handle: string;
  productType?: string | null;
  vendor?: string | null;
  collections?: Array<{ id: string; title: string; handle: string }> | null;
  descriptionHtml?: string | null;
  options?: ShopifyProductOption[] | null;
  variants?: ShopifyProductVariant[] | null;
  tags?: string[] | string | null;
  metafields?: ShopifyMetafield[] | Record<string, unknown> | null;
  images?: ShopifyImage[] | null;
  featuredImage?: ShopifyImage | null;
}

export interface ProductState {
  productId: string;
  handle: string;
  status: ProductStatus;
  availableFixations: FixationType[];
  requestedImageTypes: ImageType[];
  generatedImages: Record<string, string>;
  attachedImages: Record<string, string>;
  error: string | null;
  updatedAt: string;
}
