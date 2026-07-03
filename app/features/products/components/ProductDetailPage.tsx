import { Lightbox, useLightbox } from "@/components/common/Lightbox";
import { ImageRetouchDialog } from "@/components/image-retouch-dialog";
import { EmptyState } from "@/components/page";

import { DeleteImageDialog } from "./DeleteImageDialog";
import { GenerateImagesDialog } from "./GenerateImagesDialog";
import { ProductFacts } from "./ProductFacts";
import { ProductHeader } from "./ProductHeader";
import { ProductImageHistory } from "./ProductImageHistory";
import { ProductImagesSection } from "./ProductImagesSection";
import { PublishImagesDialog } from "./PublishImagesDialog";
import { useProductDetail } from "../hooks/useProductDetail";
import { useProductImageDelete } from "../hooks/useProductImageDelete";
import { useProductImageGeneration } from "../hooks/useProductImageGeneration";
import { useProductImagePublish } from "../hooks/useProductImagePublish";
import { useProductImageRetouch } from "../hooks/useProductImageRetouch";
import { useProductImageReview } from "../hooks/useProductImageReview";
import { useProductImagesViewModel } from "../hooks/useProductImagesViewModel";
import { useShopifyImageReorder } from "../hooks/useShopifyImageReorder";
import type { ProductDetailPageProps } from "../types";

export function ProductDetailPage({
  productId,
  search,
}: ProductDetailPageProps) {
  const detail = useProductDetail({ productId, search });
  const lightbox = useLightbox();
  const viewModel = useProductImagesViewModel({
    product: detail.product,
    images: detail.images,
    prompts: detail.prompts,
    storeHandle: detail.shopInfo?.storeHandle,
  });
  const shopifyReorder = useShopifyImageReorder({
    productId,
    product: detail.product,
    serverShopifyImages: viewModel.serverShopifyImages,
  });
  const generation = useProductImageGeneration({
    product: detail.product,
    availableTypes: viewModel.availableTypes,
  });
  const review = useProductImageReview();
  const retouch = useProductImageRetouch();
  const publish = useProductImagePublish({
    product: detail.product,
    readyImages: viewModel.readyImages,
  });
  const deletion = useProductImageDelete();

  if (detail.data === undefined) {
    return (
      <main className="page">
        <EmptyState
          loading
          title="Loading product"
          body="Fetching product details, Shopify images, and generated image history."
        />
      </main>
    );
  }

  if (!detail.product) {
    return (
      <main className="page">
        <EmptyState
          title="Product not found"
          body="The product may not be synced into Convex yet."
        />
      </main>
    );
  }

  const shopifyReorderProps = shopifyReorder.canReorderShopifyImages
    ? {
        dragId: shopifyReorder.dragShopifyMediaId,
        disabled: shopifyReorder.busy,
        onDragStart: shopifyReorder.startShopifyImageReorder,
        onDragOver: shopifyReorder.reorderShopifyImageOver,
        onCommit: shopifyReorder.commitShopifyImageReorder,
      }
    : undefined;

  return (
    <main className="page">
      <ProductHeader
        productId={productId}
        product={detail.product}
        search={search}
        productNavigation={detail.productNavigation}
        primaryAction={viewModel.primaryAction}
        generationState={viewModel.generationState}
        reviewState={viewModel.reviewState}
        publishState={viewModel.publishState}
        hasProductJobs={viewModel.hasProductJobs}
        shopifyAdminUrl={viewModel.shopifyAdminUrl}
        readyImagesCount={viewModel.readyImages.length}
        syncing={detail.syncing}
        onSync={detail.sync}
        onGenerate={generation.openGenerate}
        onPublish={publish.openPush}
      />

      <div className="grid gap-4">
        <div className="min-w-0 space-y-4">
          <ProductImagesSection
            readyImagesCount={viewModel.readyImages.length}
            shopifyImages={shopifyReorder.shopifyImages}
            shopifyReorder={shopifyReorderProps}
            generatedGalleryImages={viewModel.generatedGalleryImages}
            generatingGalleryImages={viewModel.generatingGalleryImages}
            approvedCount={viewModel.approvedImages.length}
            pendingCount={viewModel.pendingImages.length}
            rejectedCount={viewModel.rejectedImages.length}
            reviewingImageId={review.reviewingImageId}
            onReview={review.setImageReview}
            onRetouch={(image) =>
              retouch.setTarget({
                id: image._id,
                url: image.storageUrl!,
                label: image.imageType,
              })
            }
            onDelete={deletion.setTarget}
            onZoom={lightbox.open}
          />

          <ProductImageHistory
            productId={productId}
            images={detail.images}
            hasProductJobs={viewModel.hasProductJobs}
            onDelete={deletion.setTarget}
          />

          <ProductFacts
            product={detail.product}
            productCollections={viewModel.productCollections}
            imageCount={detail.images.length}
          />
        </div>
      </div>

      <GenerateImagesDialog
        open={generation.open}
        onOpenChange={generation.setOpen}
        types={viewModel.availableTypes}
        selectedTypes={generation.selectedTypes}
        onToggle={generation.toggleType}
        busy={generation.busy}
        onGenerate={() => void generation.generate()}
      />

      <ImageRetouchDialog
        target={retouch.target}
        saving={retouch.saving}
        onOpenChange={(open) => {
          if (!open && !retouch.saving) retouch.setTarget(null);
        }}
        onPrepareSource={(target) =>
          retouch.prepareRetouchSource({ sourceImageId: target.id })
        }
        onSave={retouch.saveRetouch}
      />

      <PublishImagesDialog
        open={publish.open}
        onOpenChange={publish.setOpen}
        readyImages={viewModel.readyImages}
        selectedPushIds={publish.selectedPushIds}
        setSelectedPushIds={publish.setSelectedPushIds}
        replaceExisting={publish.replaceExisting}
        setReplaceExisting={publish.setReplaceExisting}
        busy={publish.busy}
        onPush={() => void publish.push()}
      />

      <Lightbox
        state={lightbox.state}
        onIndexChange={lightbox.setIndex}
        onClose={lightbox.close}
      />

      <DeleteImageDialog
        target={deletion.target}
        busy={deletion.busy}
        onOpenChange={deletion.onOpenChange}
        onConfirm={deletion.confirmDelete}
      />
    </main>
  );
}
