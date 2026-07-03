import type { ProductSearch } from "@/lib/productFilters";
import type { Doc } from "@/lib/convex";

export type ProductDetail = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
} | null;

export type ProductDetailPageProps = {
  productId: string;
  search: ProductSearch;
};

export type ProductNavigation = {
  previous?: Doc<"products"> | null;
  next?: Doc<"products"> | null;
  position?: number | null;
  total?: number | null;
};

export type ShopifyGalleryImage = {
  id?: string | null;
  mediaId?: string | null;
  url: string;
  altText?: string | null;
};

export type ShopifyCollection = {
  title?: string | null;
};
