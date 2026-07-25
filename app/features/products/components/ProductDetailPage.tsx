import { Lightbox, useLightbox } from "@/components/common/Lightbox";
import { ImageRetouchDialog } from "@/components/image-retouch-dialog";
import { EmptyState, pageContentClass } from "@/components/page";
import { useGeneratedImageRetouch } from "@/features/images/hooks/useGeneratedImageRetouch";
import { api, type Id } from "@/lib/convex";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { DeleteImageDialog } from "./DeleteImageDialog";
import { ImageTypeSelectionDialog } from "./ImageTypeSelectionDialog";
import { ProductFacts } from "./ProductFacts";
import { ProductHeader } from "./ProductHeader";
import { ProductImageHistory } from "./ProductImageHistory";
import { ProductImagesSection } from "./ProductImagesSection";
import { PublishImagesDialog } from "./PublishImagesDialog";
import { VisualGroupsSection } from "./VisualGroupsSection";
import { VisualProductWorkspace } from "./VisualProductWorkspace";
import { useProductDetail } from "../hooks/useProductDetail";
import { useProductImageDelete } from "../hooks/useProductImageDelete";
import { useProductImageGeneration } from "../hooks/useProductImageGeneration";
import { useProductImagePublish } from "../hooks/useProductImagePublish";
import { useProductImageReview } from "../hooks/useProductImageReview";
import { useProductImagesViewModel } from "../hooks/useProductImagesViewModel";
import { useShopifyImageReorder } from "../hooks/useShopifyImageReorder";
import {
  createVisualProductViewModels,
  shopifyImagesForVisualProduct,
} from "../lib/visualProductWorkspace";
import type { ProductDetailPageProps, VisualGroupsData } from "../types";

export function ProductDetailPage({
  productId,
  search,
}: ProductDetailPageProps) {
  const typedProductId = productId as Id<"products">;
  const detail = useProductDetail({ productId, search });
  const visualGroupsData = useQuery(api.visualGroups.getForProduct, {
    productId: typedProductId,
  }) as VisualGroupsData | null | undefined;
  const [activeVisualGroupId, setActiveVisualGroupId] =
    useState<Id<"visualGroups"> | null>(null);
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
    visualGroupsData,
  });
  const review = useProductImageReview();
  const retouch = useGeneratedImageRetouch();
  const publishableImages =
    visualGroupsData === undefined
      ? []
      : visualGroupsData?.config
        ? viewModel.readyImages.filter((image) => image.visualGroupId)
        : viewModel.readyImages;
  const publish = useProductImagePublish({
    product: detail.product,
    readyImages: publishableImages,
  });
  const deletion = useProductImageDelete();
  const visualProducts = useMemo(
    () =>
      createVisualProductViewModels({
        parentTitle: detail.product?.title ?? "",
        groups: visualGroupsData?.groups ?? [],
        members: visualGroupsData?.family?.members ?? [],
        images: detail.images,
      }),
    [
      detail.images,
      detail.product?.title,
      visualGroupsData?.family?.members,
      visualGroupsData?.groups,
    ],
  );
  const activeVisualProduct =
    visualProducts.find(
      (visualProduct) => visualProduct.group._id === activeVisualGroupId,
    ) ?? null;
  const usesVisualProductWorkspace = Boolean(
    visualGroupsData?.config && visualProducts.length,
  );
  const displayedViewModel = useProductImagesViewModel({
    product: detail.product,
    images: activeVisualProduct?.images ?? detail.images,
    prompts: detail.prompts,
    storeHandle: detail.shopInfo?.storeHandle,
  });
  const displayedShopifyImages = useMemo(
    () =>
      shopifyImagesForVisualProduct(
        activeVisualProduct,
        shopifyReorder.shopifyImages,
      ),
    [activeVisualProduct, shopifyReorder.shopifyImages],
  );

  if (detail.data === undefined) {
    return (
      <main className={pageContentClass}>
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
      <main className={pageContentClass}>
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
  const productImagesSection = (
    <ProductImagesSection
      readyImagesCount={displayedViewModel.readyImages.length}
      shopifyImages={displayedShopifyImages}
      shopifyDescription={
        activeVisualProduct
          ? `Images de référence associées à ${activeVisualProduct.group.label}.`
          : undefined
      }
      shopifyReorder={activeVisualProduct ? undefined : shopifyReorderProps}
      generatedGalleryImages={displayedViewModel.generatedGalleryImages}
      generatingGalleryImages={displayedViewModel.generatingGalleryImages}
      approvedCount={displayedViewModel.approvedImages.length}
      pendingCount={displayedViewModel.pendingImages.length}
      rejectedCount={displayedViewModel.rejectedImages.length}
      reviewingImageId={review.reviewingImageId}
      onReview={review.setImageReview}
      onRetouch={retouch.openRetouch}
      onDelete={deletion.setTarget}
      onZoom={lightbox.open}
    />
  );

  return (
    <main className={pageContentClass}>
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
        readyImagesCount={
          activeVisualProduct?.publishableCount ?? publishableImages.length
        }
        visualProductCount={
          usesVisualProductWorkspace ? visualProducts.length : 0
        }
        generateLabel={
          activeVisualProduct
            ? `Générer · ${activeVisualProduct.group.label}`
            : "Générer"
        }
        publishLabel={
          activeVisualProduct
            ? `Publier · ${activeVisualProduct.group.label}`
            : "Publier"
        }
        syncing={detail.syncing}
        onSync={detail.sync}
        onGenerate={
          activeVisualProduct
            ? () =>
                generation.openGenerateForGroup(activeVisualProduct.group._id)
            : generation.openGenerate
        }
        onPublish={
          activeVisualProduct
            ? () => publish.openPushForGroup(activeVisualProduct.group._id)
            : publish.openPush
        }
      />

      <div className="grid gap-4">
        <div className="min-w-0 space-y-4">
          {usesVisualProductWorkspace && visualGroupsData?.config ? (
            <VisualProductWorkspace
              visualProducts={visualProducts}
              activeGroupId={activeVisualProduct?.group._id ?? null}
              onSelect={setActiveVisualGroupId}
            >
              {productImagesSection}
            </VisualProductWorkspace>
          ) : null}

          <VisualGroupsSection
            productId={typedProductId}
            storeHandle={detail.shopInfo?.storeHandle}
            data={visualGroupsData}
            onZoom={lightbox.open}
          />

          {!usesVisualProductWorkspace ? productImagesSection : null}

          <ProductImageHistory
            productId={productId}
            images={activeVisualProduct?.images ?? detail.images}
            hasProductJobs={viewModel.hasProductJobs}
            onDelete={deletion.setTarget}
          />

          {!activeVisualProduct ? (
            <ProductFacts
              product={detail.product}
              productCollections={viewModel.productCollections}
              imageCount={detail.images.length}
            />
          ) : null}
        </div>
      </div>

      <ImageTypeSelectionDialog
        open={generation.open}
        onOpenChange={generation.setOpen}
        types={viewModel.availableTypes}
        selectedTypes={generation.selectedTypes}
        visualGroupsData={visualGroupsData}
        selectedGroupIds={generation.selectedGroupIds}
        focusedGroupId={generation.focusedGroupId}
        onToggleGroup={generation.toggleGroup}
        busy={generation.busy}
        onGenerate={() => void generation.generate()}
        title={
          activeVisualProduct
            ? `Générer · ${activeVisualProduct.group.label}`
            : "Générer les images"
        }
        description={
          activeVisualProduct
            ? "Choisissez les types d’image à générer pour cette déclinaison."
            : "Choisissez les déclinaisons et les types d’image à générer."
        }
        submitLabel="Lancer la génération"
        onToggleType={generation.toggleType}
      />

      <ImageRetouchDialog
        target={retouch.target}
        saving={retouch.saving}
        onOpenChange={(open) => {
          if (!open) retouch.closeRetouch();
        }}
        onPrepareSource={(target) =>
          retouch.prepareRetouchSource({ sourceImageId: target.id })
        }
        onSave={retouch.saveRetouch}
      />

      <PublishImagesDialog
        open={publish.open}
        onOpenChange={publish.setOpen}
        readyImages={publishableImages}
        selectedPushIds={publish.selectedPushIds}
        setSelectedPushIds={publish.setSelectedPushIds}
        replaceExisting={publish.replaceExisting}
        setReplaceExisting={publish.setReplaceExisting}
        replaceVariantMedia={publish.replaceVariantMedia}
        setReplaceVariantMedia={publish.setReplaceVariantMedia}
        hasVisualGroups={Boolean(visualGroupsData?.config)}
        visualGroupsData={visualGroupsData}
        focusedGroupId={publish.focusedGroupId}
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
