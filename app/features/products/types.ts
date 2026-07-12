import type { ProductSearch } from "@/lib/productFilters";
import type {
  GenerationStatus,
  ProductGenerationState,
  ProductPrimaryAction,
  ProductPublishState,
  ProductReviewState,
} from "@/lib/status";
import type { Doc } from "@/lib/convex";

export type ProductListItem = {
  _id: Doc<"products">["_id"];
  _creationTime: Doc<"products">["_creationTime"];
  shopifyProductId: string;
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  shopifyStatus?: string | null;
  featuredImageUrl?: string | null;
  featuredImageDisplayUrl?: string | null;
  shopifyImageCount: number;
  generationStatus: GenerationStatus;
  generationState: ProductGenerationState;
  reviewState: ProductReviewState;
  publishState: ProductPublishState;
  primaryAction: ProductPrimaryAction;
  generatedImageCount?: number;
  failedImageCount?: number;
  pendingReviewCount?: number;
};

export type ProductFacets = {
  productTypes: string[];
  shopifyStatuses: string[];
  collections: Array<{ id: string; title: string; handle?: string }>;
};

export type ProductPageResult = {
  page: ProductListItem[];
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

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
  displayUrl?: string | null;
  altText?: string | null;
};

export type ShopifyCollection = {
  title?: string | null;
};
