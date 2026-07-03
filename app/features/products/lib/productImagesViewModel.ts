import {
  getReviewStatus,
  isPushReady,
  isReviewable,
} from "../../images/lib/review";
import { getShopifyAdminUrl } from "../../shopify/lib/admin";
import { shopifyMediaId } from "../../shopify/lib/media";
import {
  type ProductGenerationState,
  type ProductPrimaryAction,
  type ProductPublishState,
  type ProductReviewState,
} from "../../../lib/status";
import type { Doc } from "../../../lib/convex";

import type { ShopifyCollection, ShopifyGalleryImage } from "../types";

type ProductImagesViewModelInput = {
  product: Doc<"products"> | null | undefined;
  images: Doc<"generatedImages">[];
  prompts: Doc<"promptTemplates">[] | undefined;
  storeHandle: string | null | undefined;
};

export function createProductImagesViewModel({
  product,
  images,
  prompts,
  storeHandle,
}: ProductImagesViewModelInput) {
  const productCollections = (product?.collections ??
    []) as ShopifyCollection[];
  const serverShopifyImages = (product?.currentShopifyImages ??
    []) as ShopifyGalleryImage[];
  const hasProductJobs = Boolean(product?.latestJobId ?? images[0]?.jobId);
  const shopifyAdminUrl = getShopifyAdminUrl(product, storeHandle);
  const availableTypes = (prompts ?? []).filter((prompt) => prompt.isActive);

  const generatedGalleryImages = images.filter((image) => image.storageUrl);
  const generatingGalleryImages = images.filter(
    (image) =>
      !image.storageUrl &&
      (image.status === "queued" || image.status === "generating"),
  );
  const reviewableImages = images.filter(isReviewable);
  const approvedImages = reviewableImages.filter(
    (image) => getReviewStatus(image) === "approved",
  );
  const rejectedImages = reviewableImages.filter(
    (image) => getReviewStatus(image) === "rejected",
  );
  const pendingImages = reviewableImages.filter(
    (image) => getReviewStatus(image) === "pending",
  );
  const readyImages = images.filter(isPushReady);

  const primaryAction = (product?.primaryAction ??
    "generate") as ProductPrimaryAction;
  const generationState = (product?.generationState ??
    "not_started") as ProductGenerationState;
  const reviewState = (product?.reviewState ?? "none") as ProductReviewState;
  const publishState = (product?.publishState ??
    "not_ready") as ProductPublishState;

  const canReorderShopifyImages =
    serverShopifyImages.length > 1 &&
    serverShopifyImages.every((image) => shopifyMediaId(image));

  return {
    productCollections,
    serverShopifyImages,
    canReorderShopifyImages,
    hasProductJobs,
    shopifyAdminUrl,
    availableTypes,
    generatedGalleryImages,
    generatingGalleryImages,
    reviewableImages,
    approvedImages,
    rejectedImages,
    pendingImages,
    readyImages,
    primaryAction,
    generationState,
    reviewState,
    publishState,
  };
}

export type ProductImagesViewModel = ReturnType<
  typeof createProductImagesViewModel
>;
