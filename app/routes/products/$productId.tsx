import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ListChecks,
  RefreshCw,
  Send,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gallery } from "@/components/common/Gallery";
import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import { Lightbox, useLightbox } from "@/components/common/Lightbox";
import {
  ImageRetouchDialog,
  type RetouchTarget,
} from "@/components/image-retouch-dialog";
import { BusyIcon, EmptyState, StateBadge } from "@/components/page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  productFilterArgs,
  type ProductSearch,
  validateProductSearch,
} from "@/lib/productFilters";
import {
  getReviewStatus,
  isPushReady,
  isReviewable,
} from "@/features/images/lib/review";
import {
  generatedImageStateLabel,
  generatedImageStateTone,
} from "@/features/images/lib/state";
import { getShopifyAdminUrl } from "@/features/shopify/lib/admin";
import { shopifyMediaId } from "@/features/shopify/lib/media";
import {
  generationStateTone,
  primaryActionTone,
  productGenerationStateLabels,
  productPrimaryActionLabels,
  productPublishStateLabels,
  productReviewStateLabels,
  publishStateTone,
  reviewStateTone,
  shopifyStatusLabel,
  type ProductGenerationState,
  type ProductPrimaryAction,
  type ProductPublishState,
  type ProductReviewState,
} from "@/lib/status";
import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

export const Route = createFileRoute("/products/$productId")({
  validateSearch: validateProductSearch,
  component: ProductDetailPage,
});

type ProductDetail = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
} | null;

type ShopifyGalleryImage = {
  id?: string | null;
  mediaId?: string | null;
  url: string;
  altText?: string | null;
};

type ShopifyCollection = {
  title?: string | null;
};

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const data = useQuery(api.products.getWithImages, {
    productId: productId as Id<"products">,
  }) as ProductDetail | undefined;
  const productNavigation = useQuery(api.products.navigation, {
    productId: productId as Id<"products">,
    ...productFilterArgs(search),
  });
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const shopInfo = useQuery(api.settings.shopInfo);
  const createJob = useMutation(api.jobs.create);
  const reviewImages = useMutation(api.jobs.reviewImages);
  const generateRetouchUploadUrl = useMutation(api.jobs.generateRetouchUploadUrl);
  const pushImages = useAction(api.shopify.pushProductImages);
  const prepareRetouchSource = useAction(api.retouch.prepareRetouchSource);
  const saveRetouchedImage = useAction(api.retouch.saveRetouchedImage);
  const syncProduct = useAction(api.shopify.syncProduct);
  const deleteImage = useAction(api.shopify.deleteImage);
  const reorderProductImages = useAction(api.shopify.reorderProductImages);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [selectedPushIds, setSelectedPushIds] = useState<
    Set<Id<"generatedImages">>
  >(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewingImageId, setReviewingImageId] =
    useState<Id<"generatedImages"> | null>(null);
  const lightbox = useLightbox();
  const [deleteTarget, setDeleteTarget] =
    useState<Doc<"generatedImages"> | null>(null);
  const [retouchTarget, setRetouchTarget] = useState<RetouchTarget | null>(
    null,
  );
  const [retouchSaving, setRetouchSaving] = useState(false);
  const [shopifyReorderBusy, setShopifyReorderBusy] = useState(false);
  const [dragShopifyMediaId, setDragShopifyMediaId] = useState<string | null>(
    null,
  );
  const dragShopifyMediaIdRef = useRef<string | null>(null);
  const [localShopifyOrder, setLocalShopifyOrder] = useState<{
    productId: string;
    images: ShopifyGalleryImage[];
  } | null>(null);

  const product = data?.product;
  const images = data?.images ?? [];
  const productCollections = (product?.collections ?? []) as ShopifyCollection[];
  const serverShopifyImages = (product?.currentShopifyImages ??
    []) as ShopifyGalleryImage[];
  const shopifyImages =
    localShopifyOrder?.productId === productId
      ? localShopifyOrder.images
      : serverShopifyImages;
  const canReorderShopifyImages =
    shopifyImages.length > 1 &&
    shopifyImages.every((image) => shopifyMediaId(image));
  const hasProductJobs = Boolean(product?.latestJobId ?? images[0]?.jobId);
  const shopifyAdminUrl = useMemo(
    () => getShopifyAdminUrl(product, shopInfo?.storeHandle),
    [product, shopInfo?.storeHandle],
  );
  const availableTypes = useMemo(
    () => (prompts ?? []).filter((prompt) => prompt.isActive),
    [prompts],
  );
  // Include already-pushed ("uploaded") images so they can be re-pushed, e.g.
  // after regenerating them as optimized WebP.
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

  useEffect(() => {
    if (!localShopifyOrder || localShopifyOrder.productId !== productId) return;
    const localIds = localShopifyOrder.images.map(shopifyMediaId);
    const serverIds = serverShopifyImages.map(shopifyMediaId);
    if (
      localIds.length === serverIds.length &&
      localIds.every((id, index) => id === serverIds[index])
    ) {
      setLocalShopifyOrder(null);
    }
  }, [localShopifyOrder, productId, serverShopifyImages]);

  function openGenerate() {
    // Pre-check preset templates; fall back to all if none are marked preset.
    const presets = availableTypes.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : availableTypes;
    setSelectedTypes(new Set(defaults.map((type) => type.imageType)));
    setGenerateOpen(true);
  }

  async function generate() {
    if (!product || !selectedTypes.size) return;
    setBusy("generate");
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(selectedTypes),
        forceRegenerate: true,
      });
      setGenerateOpen(false);
      toast.success("Background generation started", {
        description: "Progress updates live on this product.",
        action: {
          label: "View job",
          onClick: () =>
            void navigate({ to: "/jobs/$jobId", params: { jobId } }),
        },
      });
    } catch (jobError) {
      toast.error("Failed to start generation", {
        description:
          jobError instanceof Error ? jobError.message : String(jobError),
      });
    } finally {
      setBusy(null);
    }
  }

  function openPush() {
    setSelectedPushIds(new Set(readyImages.map((image) => image._id)));
    setReplaceExisting(false);
    setPushOpen(true);
  }

  async function setImageReview(
    image: Doc<"generatedImages">,
    reviewStatus: "approved" | "rejected",
  ) {
    setReviewingImageId(image._id);
    try {
      await reviewImages({ imageIds: [image._id], reviewStatus });
    } catch (reviewError) {
      toast.error("Review update failed", {
        description:
          reviewError instanceof Error
            ? reviewError.message
            : String(reviewError),
      });
    } finally {
      setReviewingImageId(null);
    }
  }

  async function saveRetouch(target: RetouchTarget, blob: Blob) {
    setRetouchSaving(true);
    try {
      const uploadUrl = await generateRetouchUploadUrl({});
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/png" },
        body: blob,
      });
      if (!upload.ok) {
        throw new Error(`Upload failed with status ${upload.status}.`);
      }

      const payload = (await upload.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload response did not include a storage id.");
      }

      await saveRetouchedImage({
        sourceImageId: target.id,
        storageId: payload.storageId as Id<"_storage">,
        contentType: blob.type || "image/png",
      });
      setRetouchTarget(null);
      toast.success("Version retouchee enregistree", {
        description: "Elle est ajoutee en attente de validation.",
      });
    } catch (retouchError) {
      toast.error("Retouche non enregistree", {
        description:
          retouchError instanceof Error
            ? retouchError.message
            : String(retouchError),
      });
      throw retouchError;
    } finally {
      setRetouchSaving(false);
    }
  }

  async function sync() {
    if (!product) return;
    setBusy("sync");
    try {
      await syncProduct({ productId: product._id });
      toast.success("Product synced from Shopify");
    } catch (syncError) {
      toast.error("Sync failed", {
        description:
          syncError instanceof Error ? syncError.message : String(syncError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const label = deleteTarget.imageType;
    setBusy("delete");
    try {
      await deleteImage({ imageId: deleteTarget._id });
      setDeleteTarget(null);
      toast.success(`Deleted ${label} image everywhere`);
    } catch (deleteError) {
      toast.error("Delete failed", {
        description:
          deleteError instanceof Error
            ? deleteError.message
            : String(deleteError),
      });
    } finally {
      setBusy(null);
    }
  }

  function startShopifyImageReorder(mediaId: string) {
    dragShopifyMediaIdRef.current = mediaId;
    setDragShopifyMediaId(mediaId);
  }

  function reorderShopifyImageOver(overMediaId: string) {
    const draggedMediaId = dragShopifyMediaIdRef.current;
    if (!draggedMediaId || draggedMediaId === overMediaId) return;
    const from = shopifyImages.findIndex(
      (image) => shopifyMediaId(image) === draggedMediaId,
    );
    const to = shopifyImages.findIndex(
      (image) => shopifyMediaId(image) === overMediaId,
    );
    if (from === -1 || to === -1) return;
    const next = [...shopifyImages];
    const [draggedImage] = next.splice(from, 1);
    next.splice(to, 0, draggedImage);
    setLocalShopifyOrder({ productId, images: next });
  }

  async function commitShopifyImageReorder() {
    if (!product || !dragShopifyMediaIdRef.current) return;
    dragShopifyMediaIdRef.current = null;
    setDragShopifyMediaId(null);
    if (!localShopifyOrder || localShopifyOrder.productId !== productId) return;

    setShopifyReorderBusy(true);
    try {
      const result = await reorderProductImages({
        productId: product._id,
        orderedMediaIds: localShopifyOrder.images.map(shopifyMediaId),
      });
      toast.success(
        result.pending
          ? "Shopify image reorder queued"
          : "Shopify image order saved",
        {
          description: result.pending
            ? "Shopify is still applying the new gallery order."
            : "Prompt references now follow this gallery order.",
        },
      );
    } catch (reorderError) {
      setLocalShopifyOrder(null);
      toast.error("Failed to reorder Shopify images", {
        description:
          reorderError instanceof Error
            ? reorderError.message
            : String(reorderError),
      });
    } finally {
      setShopifyReorderBusy(false);
    }
  }

  async function push() {
    if (!product || !selectedPushIds.size) return;
    const count = selectedPushIds.size;
    setBusy("push");
    try {
      await pushImages({
        productId: product._id,
        imageIds: readyImages
          .filter((image) => selectedPushIds.has(image._id))
          .map((image) => image._id),
        replaceExisting,
      });
      setPushOpen(false);
      toast.success(
        `Pushed ${count} image${count === 1 ? "" : "s"} to Shopify`,
      );
    } catch (pushError) {
      toast.error("Push failed", {
        description: errorMessage(pushError),
      });
    } finally {
      setBusy(null);
    }
  }

  if (data === undefined) {
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

  if (!product) {
    return (
      <main className="page">
        <EmptyState
          title="Product not found"
          body="The product may not be synced into Convex yet."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <header className="mb-4 flex flex-col gap-4 border-b border-white/10 pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="-ml-2 text-muted-foreground"
                  >
                    <Link to="/products" search={search}>
                      <ArrowLeft data-icon="inline-start" />
                      Produits
                    </Link>
                  </Button>
                </BreadcrumbItem>
                <BreadcrumbItem className="sr-only">
                  <BreadcrumbPage>{product.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <StateBadge state={primaryActionTone(primaryAction)}>
              {productPrimaryActionLabels[primaryAction]}
            </StateBadge>
            <StateBadge state={generationStateTone(generationState)}>
              {productGenerationStateLabels[generationState]}
            </StateBadge>
            <StateBadge state={reviewStateTone(reviewState)}>
              {productReviewStateLabels[reviewState]}
            </StateBadge>
            <StateBadge state={publishStateTone(publishState)}>
              {productPublishStateLabels[publishState]}
            </StateBadge>
            <Badge variant="outline">
              {product.productType || "Sans categorie"}
            </Badge>
            {product.shopifyStatus ? (
              <Badge variant="outline">
                {shopifyStatusLabel(product.shopifyStatus)}
              </Badge>
            ) : null}
            {product.vendor ? (
              <Badge variant="outline">{product.vendor}</Badge>
            ) : null}
          </div>
          <h1 className="truncate text-2xl font-semibold sm:text-3xl">
            {product.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProductNavigationButton
              direction="previous"
              product={productNavigation?.previous}
              search={search}
            />
            <span className="text-xs text-muted-foreground">
              {productNavigation?.position
                ? `${productNavigation.position} / ${productNavigation.total}`
                : `${productNavigation?.total ?? 0} products`}
            </span>
            <ProductNavigationButton
              direction="next"
              product={productNavigation?.next}
              search={search}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasProductJobs ? (
            <Button size="lg" variant="outline" asChild>
              <Link to="/jobs" search={{ productId }}>
                <ListChecks data-icon="inline-start" />
                Jobs
              </Link>
            </Button>
          ) : null}
          <Button
            size="lg"
            variant="outline"
            onClick={() => void sync()}
            disabled={busy === "sync"}
          >
            <BusyIcon busy={busy === "sync"} />
            {busy !== "sync" ? <RefreshCw data-icon="inline-start" /> : null}
            Sync
          </Button>
          {shopifyAdminUrl ? (
            <Button size="lg" variant="outline" asChild>
              <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Shopify
              </a>
            </Button>
          ) : null}
          <Button size="lg" onClick={openGenerate}>
            <WandSparkles data-icon="inline-start" />
            Generer
          </Button>
          {readyImages.length ? (
            <Button size="lg" disabled={!readyImages.length} onClick={openPush}>
              <Send data-icon="inline-start" />
              Publier
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-sm font-medium">
              {readyImages.length} image
              {readyImages.length === 1 ? "" : "s"} prete
              {readyImages.length === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              Seules les images approuvees sont publiees.
            </p>
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            <Gallery
              title="Images Shopify"
              description="Glissez pour changer l'ordre Shopify. La premiere image sert de reference produit."
              items={shopifyImages.map((image) => ({
                id: shopifyMediaId(image),
                url: image.url,
                label: image.altText ?? "Shopify product",
              }))}
              emptyText="Aucune image Shopify."
              onZoom={lightbox.open}
              reorder={
                canReorderShopifyImages
                  ? {
                      dragId: dragShopifyMediaId,
                      disabled: shopifyReorderBusy,
                      onDragStart: startShopifyImageReorder,
                      onDragOver: reorderShopifyImageOver,
                      onCommit: commitShopifyImageReorder,
                    }
                  : undefined
              }
            />
            <Gallery
              title="Images generees"
              description={`${approvedImages.length} approved · ${pendingImages.length} to review · ${rejectedImages.length} rejected`}
            items={generatedGalleryImages.map((image) => ({
              id: image._id,
              url: image.storageUrl!,
              label: image.imageType,
              caption: image.imageType,
              retouched: Boolean(image.retouchSourceImageId),
              reviewStatus: getReviewStatus(image),
              statusLabel: generatedImageStateLabel(image),
              statusTone: generatedImageStateTone(image),
              reviewable: isReviewable(image),
              reviewing: reviewingImageId === image._id,
              onApprove: () => void setImageReview(image, "approved"),
              onReject: () => void setImageReview(image, "rejected"),
              onRetouch: () =>
                setRetouchTarget({
                  id: image._id,
                  url: image.storageUrl!,
                  label: image.imageType,
                }),
              onDelete: () => setDeleteTarget(image),
            }))}
              pendingItems={generatingGalleryImages.map((image) => ({
                id: image._id,
                caption: image.imageType,
                statusLabel: "Generation en cours",
              }))}
              emptyText="Aucune image generee."
              onZoom={lightbox.open}
            />
          </section>

          <Card className="studio-card mb-4 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">
                Historique prompts et images
              </CardTitle>
              {hasProductJobs ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/jobs" search={{ productId }}>
                    <ListChecks data-icon="inline-start" />
                    Jobs
                    <ChevronRight data-icon="inline-end" />
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {images.length ? (
                <Accordion type="multiple" className="gap-3">
                  {images.map((image) => (
                    <HistoryItem
                      key={image._id}
                      image={image}
                      onDelete={() => setDeleteTarget(image)}
                    />
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun historique de generation.
                </p>
              )}
            </CardContent>
          </Card>

          <section className="studio-card rounded-lg border p-4">
            <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
              <Fact
                label="Collections"
                value={
                  productCollections
                    .map((collection) => collection.title)
                    .join(", ") || "Aucune"
                }
              />
              <Fact
                label="Statut Shopify"
                value={shopifyStatusLabel(product.shopifyStatus)}
              />
              <Fact
                label="Dernier sync"
                value={
                  product.lastSyncedAt
                    ? new Date(product.lastSyncedAt).toLocaleString()
                    : "Jamais"
                }
              />
              <Fact label="Historique" value={`${images.length} images`} />
            </dl>
          </section>
        </div>
      </div>

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        types={availableTypes}
        selectedTypes={selectedTypes}
        onToggle={(type) =>
          setSelectedTypes((current) => {
            const next = new Set(current);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
          })
        }
        busy={busy === "generate"}
        onGenerate={() => void generate()}
      />

      <ImageRetouchDialog
        target={retouchTarget}
        saving={retouchSaving}
        onOpenChange={(open) => {
          if (!open && !retouchSaving) setRetouchTarget(null);
        }}
        onPrepareSource={(target) =>
          prepareRetouchSource({ sourceImageId: target.id })
        }
        onSave={saveRetouch}
      />

      <AlertDialog open={pushOpen} onOpenChange={setPushOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Push generated images to Shopify?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose which approved images to upload. Rejected and unreviewed
              images stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedPushIds.size} of {readyImages.length} selected
            </span>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={
                  readyImages.length > 0 &&
                  selectedPushIds.size === readyImages.length
                }
                onCheckedChange={(checked) =>
                  setSelectedPushIds(
                    checked === true
                      ? new Set(readyImages.map((image) => image._id))
                      : new Set(),
                  )
                }
              />
              Select all
            </Label>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto">
            {readyImages.map((image) => (
              <Label
                key={image._id}
                className="flex items-center gap-3 rounded-lg border p-2 has-[:checked]:border-primary"
              >
                <Checkbox
                  checked={selectedPushIds.has(image._id)}
                  onCheckedChange={(checked) =>
                    setSelectedPushIds((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(image._id);
                      else next.delete(image._id);
                      return next;
                    })
                  }
                />
                <div className="image-tile size-12 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                  <img src={image.storageUrl!} alt={image.imageType} />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {image.imageType}
                </span>
                  <ImageStateBadge image={image} />
              </Label>
            ))}
          </div>
          <Label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={replaceExisting}
              onCheckedChange={(checked) =>
                setReplaceExisting(checked === true)
              }
            />
            <span>Replace current Shopify gallery after upload</span>
          </Label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "push"}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={busy === "push" || !selectedPushIds.size}
              onClick={() => void push()}
            >
              <BusyIcon busy={busy === "push"} />
              Push {selectedPushIds.size} image
              {selectedPushIds.size === 1 ? "" : "s"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Lightbox
        state={lightbox.state}
        onIndexChange={lightbox.setIndex}
        onClose={lightbox.close}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              The <strong>{deleteTarget?.imageType}</strong> image will be
              removed from storage, from Shopify if it was pushed, and from this
              product's history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy === "delete"}
              onClick={() => void confirmDelete()}
            >
              <BusyIcon busy={busy === "delete"} />
              {busy !== "delete" ? <Trash2 data-icon="inline-start" /> : null}
              Delete everywhere
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ProductNavigationButton({
  direction,
  product,
  search,
}: {
  direction: "previous" | "next";
  product: Doc<"products"> | null | undefined;
  search: ProductSearch;
}) {
  const label = direction === "previous" ? "Previous" : "Next";
  const icon =
    direction === "previous" ? (
      <ChevronLeft data-icon="inline-start" />
    ) : (
      <ChevronRight data-icon="inline-end" />
    );
  if (!product) {
    return (
      <Button variant="outline" size="sm" disabled>
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        to="/products/$productId"
        params={{ productId: product._id }}
        search={search}
        title={product.title}
      >
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </Link>
    </Button>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  onToggle,
  busy,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Doc<"promptTemplates">[];
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate images</DialogTitle>
          <DialogDescription>
            Select image types for this product. Each type maps to a prompt
            template.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label
              key={type.imageType}
              className="flex min-h-11 justify-between rounded-lg border px-3"
            >
              <span>{type.label}</span>
              <Checkbox
                checked={selectedTypes.has(type.imageType)}
                onCheckedChange={() => onToggle(type.imageType)}
              />
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={!selectedTypes.size || busy} onClick={onGenerate}>
            <BusyIcon busy={busy} />
            {!busy ? <WandSparkles data-icon="inline-start" /> : null}
            Start background job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function HistoryItem({
  image,
  onDelete,
}: {
  image: Doc<"generatedImages">;
  onDelete: () => void;
}) {
  const providerLabel =
    image.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI";
  return (
    <AccordionItem
      value={image._id}
      className="rounded-lg border px-3 last:border-b"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2">
          {image.imageType}
          <Separator orientation="vertical" className="h-4" />
          <ImageStateBadge image={image} />
          <Badge variant="outline">{providerLabel}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-3 pt-2">
          {image.error ? (
            <Alert variant="destructive">
              <AlertDescription>{image.error}</AlertDescription>
            </Alert>
          ) : null}
          {image.storageUrl ? (
            <a
              className="break-all text-sm underline underline-offset-4"
              href={image.storageUrl}
              target="_blank"
              rel="noreferrer"
            >
              {image.storageUrl}
            </a>
          ) : null}
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {image.promptUsed}
          </pre>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 data-icon="inline-start" />
              Delete everywhere
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
