import type { Doc } from "../_generated/dataModel";
import {
  calculateProductStatus as calculateProductStatusFromImages,
  calculateProductWorkflow as calculateProductWorkflowFromImages,
} from "../shared/productWorkflow";

export type ProductFilters = {
  search?: string;
  productType?: string;
  collection?: string;
  shopifyStatus?: string;
  primaryAction?: Doc<"products">["primaryAction"];
  generationState?: Doc<"products">["generationState"];
  reviewState?: Doc<"products">["reviewState"];
  publishState?: Doc<"products">["publishState"];
  generationStatus?: Doc<"products">["generationStatus"];
};

export const PRODUCT_FACETS_KEY = "PRODUCT_FACETS";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type ProductFacets = {
  productTypes: string[];
  shopifyStatuses: string[];
  collections: Array<{ id: string; title: string; handle?: string }>;
};

export function calculateProductStatus(images: Doc<"generatedImages">[]): Doc<"products">["generationStatus"] {
  return calculateProductStatusFromImages(images);
}

export function calculateProductWorkflow(images: Doc<"generatedImages">[]) {
  return calculateProductWorkflowFromImages(images);
}

export function lightProduct(product: Doc<"products">) {
  const generationState = product.generationState ?? legacyGenerationState(product.generationStatus);
  const reviewState = product.reviewState ?? legacyReviewState(product);
  const publishState = product.publishState ?? legacyPublishState(product);
  const primaryAction = product.primaryAction ?? legacyPrimaryAction(generationState, reviewState, publishState);
  const featuredImage = product.currentShopifyImages[0] as
    | { url?: string | null; displayUrl?: string | null }
    | undefined;
  return {
    _id: product._id,
    _creationTime: product._creationTime,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    productType: product.productType,
    shopifyStatus: product.shopifyStatus,
    featuredImageUrl: product.featuredImageUrl,
    featuredImageDisplayUrl:
      featuredImage?.displayUrl ??
      featuredImage?.url ??
      product.featuredImageUrl,
    shopifyImageCount: product.shopifyImageCount ?? product.currentShopifyImages.length,
    generationStatus: product.generationStatus,
    generationState,
    reviewState,
    publishState,
    primaryAction,
    generatedImageCount: product.generatedImageCount ?? 0,
    failedImageCount: product.failedImageCount ?? 0,
    publishedImageCount: product.publishedImageCount ?? 0,
    publishableImageCount: product.publishableImageCount ?? 0,
    pendingReviewCount: product.pendingReviewCount ?? 0,
    approvedImageCount: product.approvedImageCount ?? 0,
    rejectedImageCount: product.rejectedImageCount ?? 0,
    latestJobId: product.latestJobId ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export function legacyGenerationState(status: Doc<"products">["generationStatus"]): NonNullable<Doc<"products">["generationState"]> {
  if (status === "not_started") return "not_started";
  if (status === "generating") return "generating";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  if (status === "partial") return "incomplete";
  return "complete";
}

export function legacyReviewState(product: Doc<"products">): NonNullable<Doc<"products">["reviewState"]> {
  const generated = product.generatedImageCount ?? 0;
  const pending = product.pendingReviewCount ?? 0;
  const approved = product.approvedImageCount ?? 0;
  const rejected = product.rejectedImageCount ?? 0;
  if (generated === 0) return "none";
  if (pending > 0 && approved > 0) return "partially_approved";
  if (pending > 0) return "needs_review";
  if (approved === generated) return "approved";
  if (rejected === generated) return "rejected";
  if (approved > 0) return "partially_approved";
  return "rejected";
}

export function legacyPublishState(product: Doc<"products">): NonNullable<Doc<"products">["publishState"]> {
  if (product.generationStatus === "pushed") return "pushed";
  if ((product.approvedImageCount ?? 0) > 0) return "ready_to_push";
  return "not_ready";
}

export function legacyPrimaryAction(
  generationState: NonNullable<Doc<"products">["generationState"]>,
  reviewState: NonNullable<Doc<"products">["reviewState"]>,
  publishState: NonNullable<Doc<"products">["publishState"]>
): NonNullable<Doc<"products">["primaryAction"]> {
  if (generationState === "not_started") return "generate";
  if (generationState === "generating") return "wait";
  if (reviewState === "needs_review" || reviewState === "partially_approved") return "review";
  if (publishState === "ready_to_push" || publishState === "partially_pushed") return "push";
  if (generationState === "failed" || generationState === "canceled" || generationState === "incomplete") return "fix_errors";
  if (publishState === "pushed") return "done";
  if (reviewState === "rejected") return "generate";
  return "generate";
}

export function productWorkflowFields(product: Doc<"products">) {
  const generationState = product.generationState ?? legacyGenerationState(product.generationStatus);
  const reviewState = product.reviewState ?? legacyReviewState(product);
  const publishState = product.publishState ?? legacyPublishState(product);
  const primaryAction = product.primaryAction ?? legacyPrimaryAction(generationState, reviewState, publishState);
  return { generationState, reviewState, publishState, primaryAction };
}

export function buildFacets(products: Doc<"products">[]): ProductFacets {
  const productTypes = Array.from(new Set(products.map((product) => product.productType).filter(Boolean) as string[])).sort();
  const shopifyStatuses = Array.from(new Set(products.map((product) => product.shopifyStatus).filter(Boolean) as string[])).sort();
  const collections = new Map<string, { id: string; title: string; handle?: string }>();
  products.forEach((product) => {
    product.collections.forEach((collection: { id?: string; title?: string; handle?: string }) => {
      const id = collection.id ?? collection.handle ?? collection.title;
      if (id && collection.title) collections.set(id, { id, title: collection.title, handle: collection.handle });
    });
  });
  return { productTypes, shopifyStatuses, collections: Array.from(collections.values()).sort((a, b) => a.title.localeCompare(b.title)) };
}

export function productMatches(product: Doc<"products">, args: ProductFilters, needle: string) {
  const workflow = productWorkflowFields(product);
  const matchesSearch =
    !needle ||
    product.title.toLowerCase().includes(needle) ||
    product.handle.toLowerCase().includes(needle);
  const matchesProductType = !args.productType || product.productType === args.productType;
  const matchesCollection =
    !args.collection ||
    product.collections.some((collection: { id?: string; title?: string; handle?: string }) => {
      return collection.id === args.collection || collection.handle === args.collection || collection.title === args.collection;
    });
  const matchesShopifyStatus = !args.shopifyStatus || product.shopifyStatus === args.shopifyStatus;
  const matchesPrimaryAction = !args.primaryAction || workflow.primaryAction === args.primaryAction;
  const matchesGenerationState = !args.generationState || workflow.generationState === args.generationState;
  const matchesReviewState = !args.reviewState || workflow.reviewState === args.reviewState;
  const matchesPublishState = !args.publishState || workflow.publishState === args.publishState;
  const matchesGenerationStatus = !args.generationStatus || product.generationStatus === args.generationStatus;
  return (
    matchesSearch &&
    matchesProductType &&
    matchesCollection &&
    matchesShopifyStatus &&
    matchesPrimaryAction &&
    matchesGenerationState &&
    matchesReviewState &&
    matchesPublishState &&
    matchesGenerationStatus
  );
}
