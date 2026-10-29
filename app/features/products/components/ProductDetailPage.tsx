import { useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useLightbox } from "@/components/common/Lightbox";
import { EmptyState, pageContentClass } from "@/components/page";
import { Button } from "@/components/ui/button";
import { useGeneratedImageRetouch } from "@/features/images/hooks/useGeneratedImageRetouch";
import { api, type Id } from "@/lib/convex";
import { ProductDetailDialogs } from "./ProductDetailDialogs";
import { ProductFacts } from "./ProductFacts";
import { ProductHeader } from "./ProductHeader";
import { ProductImageHistory } from "./ProductImageHistory";
import { ProductImagesSection } from "./ProductImagesSection";
import { ProductPublishFlow } from "./ProductPublishFlow";
import { ProductWorkspaceTabs } from "./ProductWorkspaceTabs";
import { ShopifyImagesGallery } from "./ShopifyImagesGallery";
import { VisualGroupsSection } from "./VisualGroupsSection";
import { VisualProductWorkspace } from "./VisualProductWorkspace";
import { useProductDetail } from "../hooks/useProductDetail";
import { ArchivedProductHistory } from "./ArchivedProductHistory";
import { useProductImageDelete } from "../hooks/useProductImageDelete";
import { useProductImageGeneration } from "../hooks/useProductImageGeneration";
import { useProductImageReview } from "../hooks/useProductImageReview";
import { useProductImagesViewModel } from "../hooks/useProductImagesViewModel";
import { useShopifyImageReorder } from "../hooks/useShopifyImageReorder";
import { createVisualProductViewModels, shopifyImagesForVisualProduct } from "../lib/visualProductWorkspace";
import { pendingReviewImages, publicationImagesInScope } from "../lib/productImageViews";
import type { ProductWorkspaceSearch } from "../lib/productWorkspaceSearch";
import type { ProductDetailPageProps, VisualGroupsData } from "../types";

export function ProductDetailPage({ productId, search }: ProductDetailPageProps) {
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const typedProductId = productId as Id<"products">;
  const detail = useProductDetail({ productId, search });
  const visualGroupsData = useQuery(api.visualGroups.getForProduct, { productId: typedProductId }) as VisualGroupsData | null | undefined;
  const lightbox = useLightbox();
  const viewModel = useProductImagesViewModel({ product: detail.product, images: detail.images, prompts: detail.prompts, storeHandle: detail.shopInfo?.storeHandle });
  const shopifyReorder = useShopifyImageReorder({ productId, product: detail.product, serverShopifyImages: viewModel.serverShopifyImages });
  const generation = useProductImageGeneration({ product: detail.product, availableTypes: viewModel.availableTypes, visualGroupsData });
  const review = useProductImageReview();
  const retouch = useGeneratedImageRetouch();
  const deletion = useProductImageDelete();
  const visualProducts = useMemo(() => createVisualProductViewModels({
    parentTitle: detail.product?.title ?? "", groups: visualGroupsData?.groups ?? [],
    members: visualGroupsData?.family?.members ?? [], images: detail.images,
  }), [detail.images, detail.product?.title, visualGroupsData?.family?.members, visualGroupsData?.groups]);
  const activeVisualProduct = visualProducts.find(item => item.group._id === search.group) ?? null;
  const invalidGroup = Boolean(search.group && visualGroupsData !== undefined && !activeVisualProduct);
  const scopedImages = search.group ? (activeVisualProduct?.images ?? []) : detail.images;
  const publishableImages = visualGroupsData === undefined ? [] : viewModel.readyImages.filter(image => !visualGroupsData?.config || image.visualGroupId);
  const scopedReadyImages = invalidGroup ? [] : publicationImagesInScope(publishableImages, activeVisualProduct?.group._id);
  const displayedShopifyImages = shopifyImagesForVisualProduct(activeVisualProduct, shopifyReorder.shopifyImages);
  const destination = detail.shopInfo?.domain ?? detail.shopInfo?.storeHandle ?? "Boutique active";
  const scopeLabel = activeVisualProduct ? `Déclinaison ${activeVisualProduct.group.label}` : "Ensemble du produit";
  const view = search.view ?? "images";
  const actionsDisabled = invalidGroup || visualGroupsData === undefined;

  function updateWorkspace(patch: Partial<ProductWorkspaceSearch>) {
    return navigate({ to: "/products/$productId", params: { productId }, search: { ...search, prepare: undefined, ...patch }, replace: true, resetScroll: false });
  }
  function preparePublication() {
    updateWorkspace({ view: "images", images: "ready", prepare: "publish" });
  }
  function openGeneration() {
    if (activeVisualProduct) generation.openGenerateForGroup(activeVisualProduct.group._id);
    else generation.openGenerate();
  }

  if (detail.data === undefined) return <main className={pageContentClass}><EmptyState loading title="Chargement du produit" body="Lecture des images, déclinaisons et informations Shopify." /></main>;
  if (!detail.product) return <main className={pageContentClass}><EmptyState title="Produit introuvable" body="Revenez aux produits pour vérifier la synchronisation de la boutique." /></main>;
  if (detail.product.shopifyDeletedAt != null) return <ArchivedProductHistory product={detail.product} images={detail.images} hasProductJobs={viewModel.hasProductJobs} />;

  const reorder = shopifyReorder.canReorderShopifyImages ? {
    dragId: shopifyReorder.dragShopifyMediaId, disabled: shopifyReorder.busy,
    onDragStart: shopifyReorder.startShopifyImageReorder, onDragOver: shopifyReorder.reorderShopifyImageOver,
    onCommit: shopifyReorder.commitShopifyImageReorder,
  } : undefined;

  return <main className={pageContentClass}>
    <ProductHeader productId={productId} product={detail.product} search={search}
      productNavigation={detail.productNavigation} primaryAction={viewModel.primaryAction}
      hasProductJobs={viewModel.hasProductJobs} shopifyAdminUrl={viewModel.shopifyAdminUrl}
      readyImagesCount={scopedReadyImages.filter(image => image.status !== "uploaded").length}
      publishedImagesCount={scopedReadyImages.filter(image => image.status === "uploaded").length}
      titleRef={titleRef} pendingCount={pendingReviewImages(scopedImages).length}
      scopeLabel={invalidGroup ? "Déclinaison indisponible" : scopeLabel} destination={destination}
      syncing={detail.syncing} actionsDisabled={actionsDisabled} onSync={detail.sync}
      onGenerate={openGeneration} onPublish={preparePublication}
      onReview={() => updateWorkspace({ view: "images", images: "pending" })}
    />
    {invalidGroup ? <section className="studio-panel space-y-3 p-5" role="alert">
      <h2 className="font-semibold">Cette déclinaison n’est plus disponible.</h2>
      <p className="text-sm text-muted-foreground">Choisissez explicitement la vue d’ensemble pour continuer sur ce produit.</p>
      <Button variant="outline" onClick={() => updateWorkspace({ group: undefined })}>Revenir à la vue d’ensemble</Button>
    </section> : <VisualProductWorkspace visualProducts={visualProducts} activeGroupId={activeVisualProduct?.group._id ?? null}
      onSelect={group => updateWorkspace({ group: group ?? undefined })}>
      <ProductWorkspaceTabs view={view} onViewChange={next => updateWorkspace({ view: next })}
        images={<>
          {activeVisualProduct && !activeVisualProduct.group.ready && activeVisualProduct.group.references.length > 0 && <div className="studio-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">Pour {activeVisualProduct.group.label}, confirmez les références ou choisissez de générer à partir du texte de la variante.</p>
            <Button variant="outline" size="sm" onClick={() => updateWorkspace({ view: "references" })}>Vérifier les références</Button>
          </div>}
          <ProductImagesSection images={scopedImages} readyImages={scopedReadyImages}
            filter={search.images ?? "all"} onFilterChange={images => updateWorkspace({ images })}
            scopeLabel={scopeLabel} destination={destination} shopifyImages={displayedShopifyImages}
            shopifyDescription={activeVisualProduct ? `Références confirmées de ${activeVisualProduct.group.label}.` : undefined}
            shopifyReorder={activeVisualProduct ? undefined : reorder}
            reviewingImageId={review.reviewingImageId} reviewingAll={review.reviewingAll}
            onReview={review.setImageReview} onApproveAll={images => void review.approveAll(images)}
            onRetouch={retouch.openRetouch} onDelete={deletion.setTarget} onZoom={lightbox.open}
            onPublish={preparePublication} onReferences={() => updateWorkspace({ view: "references" })}
          />
        </>}
        references={<>
          <p className="text-sm text-muted-foreground">Organisation de l’ensemble du produit : options visuelles, références et variantes Shopify.</p>
          <VisualGroupsSection productId={typedProductId} storeHandle={detail.shopInfo?.storeHandle} data={visualGroupsData} onZoom={lightbox.open} />
          <ShopifyImagesGallery shopifyImages={shopifyReorder.shopifyImages} generatedImages={detail.images} onZoom={lightbox.open} onRetouch={retouch.openRetouch} reorder={reorder} />
        </>}
        history={<>
          <p className="text-sm text-muted-foreground">{scopeLabel} · Prompts, résultats et erreurs conservés.</p>
          <ProductImageHistory productId={productId} images={scopedImages} hasProductJobs={viewModel.hasProductJobs} onDelete={deletion.setTarget} />
        </>}
        information={<>
          <p className="text-sm text-muted-foreground">Informations communes à l’ensemble du produit.</p>
          <ProductFacts product={detail.product} productCollections={viewModel.productCollections} imageCount={detail.images.length} />
        </>}
      />
    </VisualProductWorkspace>}
    <ProductDetailDialogs generation={generation} retouch={retouch} deletion={deletion} lightbox={lightbox}
      availableTypes={viewModel.availableTypes} visualGroupsData={visualGroupsData} activeGroup={activeVisualProduct?.group ?? null} />
    {search.prepare === "publish" && !invalidGroup && visualGroupsData !== undefined && detail.prompts !== undefined && detail.shopInfo !== undefined &&
      <ProductPublishFlow key={`${productId}:${search.group ?? "all"}`} product={detail.product} readyImages={publishableImages}
        groupId={activeVisualProduct?.group._id ?? null} visualGroupsData={visualGroupsData}
        primaryImageType={detail.prompts[0]?.imageType ?? null} destination={destination}
        onClose={() => { void updateWorkspace({ prepare: undefined }).then(() => titleRef.current?.focus({ preventScroll: true })); }} />}
  </main>;
}
