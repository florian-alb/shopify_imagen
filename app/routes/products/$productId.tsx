import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  RefreshCw,
  Send,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  BusyIcon,
  EmptyState,
  StateBadge,
} from "@/components/page";
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
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

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

type ReviewStatus = "pending" | "approved" | "rejected";

function shopifyMediaId(image: ShopifyGalleryImage) {
  return image.mediaId ?? image.id ?? "";
}

function getReviewStatus(image: Doc<"generatedImages">): ReviewStatus {
  return image.reviewStatus ?? "pending";
}

function isReviewable(image: Doc<"generatedImages">) {
  return (
    Boolean(image.storageUrl) &&
    (image.status === "generated" || image.status === "uploaded")
  );
}

function isPushReady(image: Doc<"generatedImages">) {
  return isReviewable(image) && getReviewStatus(image) === "approved";
}

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
  const pushImages = useAction(api.shopify.pushProductImages);
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
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<Doc<"generatedImages"> | null>(null);
  const [shopifyReorderBusy, setShopifyReorderBusy] = useState(false);
  const [dragShopifyMediaId, setDragShopifyMediaId] = useState<string | null>(
    null,
  );
  const dragShopifyMediaIdRef = useRef<string | null>(null);
  const [localShopifyOrder, setLocalShopifyOrder] = useState<{
    productId: string;
    images: ShopifyGalleryImage[];
  } | null>(null);

  const openLightbox = useCallback((images: LightboxImage[], index: number) => {
    if (images.length) setLightbox({ images, index });
  }, []);

  const product = data?.product;
  const images = data?.images ?? [];
  const serverShopifyImages = (product?.currentShopifyImages ??
    []) as ShopifyGalleryImage[];
  const shopifyImages =
    localShopifyOrder?.productId === productId
      ? localShopifyOrder.images
      : serverShopifyImages;
  const canReorderShopifyImages =
    shopifyImages.length > 1 &&
    shopifyImages.every((image) => shopifyMediaId(image));
  const latestJobId = images[0]?.jobId;
  const shopifyAdminUrl = useMemo(() => {
    if (!product || !shopInfo?.storeHandle) return null;
    const numericId = product.shopifyProductId.split("/").pop();
    if (!numericId) return null;
    return `https://admin.shopify.com/store/${shopInfo.storeHandle}/products/${numericId}`;
  }, [product, shopInfo?.storeHandle]);
  const availableTypes = useMemo(
    () => (prompts ?? []).filter((prompt) => prompt.isActive),
    [prompts],
  );
  // Include already-pushed ("uploaded") images so they can be re-pushed, e.g.
  // after regenerating them as optimized WebP.
  const generatedGalleryImages = images.filter((image) => image.storageUrl);
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
  const primaryAction = (product?.primaryAction ?? "generate") as ProductPrimaryAction;
  const generationState = (product?.generationState ?? "not_started") as ProductGenerationState;
  const reviewState = (product?.reviewState ?? "none") as ProductReviewState;
  const publishState = (product?.publishState ?? "not_ready") as ProductPublishState;

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
        description:
          pushError instanceof Error ? pushError.message : String(pushError),
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
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
                      Products
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
              {product.productType || "No category"}
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
          {latestJobId ? (
            <Button size="lg" variant="outline" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: latestJobId }}>
                <ArrowLeft data-icon="inline-start" />
                Back to job
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
                View on Shopify
              </a>
            </Button>
          ) : null}
          <Button size="lg" onClick={openGenerate}>
            <WandSparkles data-icon="inline-start" />
            Generate
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <Gallery
          title="Current Shopify images"
          description="Drag images to reorder them in Shopify. Image 1 is the exact product reference for prompts; image 2 can guide the scene."
          items={shopifyImages.map((image) => ({
            id: shopifyMediaId(image),
            url: image.url,
            label: image.altText ?? "Shopify product",
          }))}
          emptyText="No images found."
          onZoom={openLightbox}
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
          title="Generated images"
          description={`${approvedImages.length} approved · ${pendingImages.length} to review · ${rejectedImages.length} rejected`}
          items={generatedGalleryImages.map((image) => ({
            url: image.storageUrl!,
            label: image.imageType,
            caption: image.imageType,
            reviewStatus: getReviewStatus(image),
            statusLabel: generatedImageStateLabel(image),
            statusTone: generatedImageStateTone(image),
            reviewable: isReviewable(image),
            reviewing: reviewingImageId === image._id,
            onApprove: () => void setImageReview(image, "approved"),
            onReject: () => void setImageReview(image, "rejected"),
            onDelete: () => setDeleteTarget(image),
          }))}
          emptyText="No generated images yet."
          onZoom={openLightbox}
        />
      </section>

      <Card className="mb-4 rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-lg">Prompt and image history</CardTitle>
          {latestJobId ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: latestJobId }}>
                View job
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
              No generated image records yet.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mb-5 px-1 py-3">
        <div className="mb-4 flex flex-wrap gap-2">
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
            {product.productType || "No category"}
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
        <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          <Fact
            label="Collections"
            value={
              product.collections
                .map((collection: any) => collection.title)
                .join(", ") || "None"
            }
          />
          <Fact
            label="Shopify status"
            value={shopifyStatusLabel(product.shopifyStatus)}
          />
          <Fact
            label="Last synced"
            value={
              product.lastSyncedAt
                ? new Date(product.lastSyncedAt).toLocaleString()
                : "Never"
            }
          />
          <Fact
            label="Generated history"
            value={`${images.length} image records`}
          />
        </dl>
      </section>

      <div className="sticky-actions">
        <Card
          size="sm"
          className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-md"
        >
          <div>
            <p className="text-sm font-medium">
              {readyImages.length} generated image
              {readyImages.length === 1 ? "" : "s"} ready
            </p>
            <p className="text-xs text-muted-foreground">
              Only approved images are pushed.
            </p>
          </div>
          <Button disabled={!readyImages.length} onClick={openPush}>
            <Send data-icon="inline-start" />
            Push
          </Button>
        </Card>
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
                <GeneratedImageStateBadge image={image} />
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
        state={lightbox}
        onIndexChange={(index) =>
          setLightbox((current) => (current ? { ...current, index } : current))
        }
        onClose={() => setLightbox(null)}
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

type LightboxImage = { url: string; label?: string };

function Lightbox({
  state,
  onIndexChange,
  onClose,
}: {
  state: { images: LightboxImage[]; index: number } | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = state !== null;
  const images = state?.images ?? [];
  const index = state?.index ?? 0;
  const current = open ? images[index] : null;
  const hasMultiple = images.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (!images.length) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => !next && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none sm:p-10"
          onClick={onClose}
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.label ?? "Image preview"}
          </DialogPrimitive.Title>
          {current ? (
            <img
              src={current.url}
              alt={current.label ?? "Image"}
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {current?.label ? (
            <span className="mt-3 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
              {current.label}
              {hasMultiple ? ` · ${index + 1} / ${images.length}` : ""}
            </span>
          ) : null}

          <DialogPrimitive.Close
            className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
            onClick={(event) => event.stopPropagation()}
          >
            <X className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 sm:left-6"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70 sm:right-6"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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

type GalleryItem = {
  id?: string;
  url: string;
  label?: string;
  caption?: string;
  reviewStatus?: ReviewStatus;
  statusLabel?: string;
  statusTone?: "neutral" | "success" | "warning" | "danger";
  reviewable?: boolean;
  reviewing?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete?: () => void;
};

type GalleryReorder = {
  dragId: string | null;
  disabled: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onCommit: () => void;
};

function Gallery({
  title,
  description,
  items,
  emptyText,
  onZoom,
  reorder,
}: {
  title: string;
  description?: string;
  items: GalleryItem[];
  emptyText: string;
  onZoom: (images: LightboxImage[], index: number) => void;
  reorder?: GalleryReorder;
}) {
  const lightboxImages = items.map((item) => ({
    url: item.url,
    label: item.label,
  }));
  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {reorder?.disabled ? <BusyIcon busy /> : null}
          <StateBadge>{items.length}</StateBadge>
        </div>
      </CardHeader>
      <CardContent>
        {description ? (
          <p className="mb-3 text-xs text-muted-foreground">{description}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.length ? (
            items.map((item, index) => {
              const canDrag = Boolean(reorder && item.id && !reorder.disabled);
              return (
                <figure
                  key={item.id ?? `${item.url}-${index}`}
                  draggable={canDrag}
                  onDragStart={(event) => {
                    if (!item.id || !reorder) return;
                    event.dataTransfer.effectAllowed = "move";
                    reorder.onDragStart(item.id);
                  }}
                  onDragOver={(event) => {
                    if (!canDrag || !item.id || !reorder) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    reorder.onDragOver(item.id);
                  }}
                  onDrop={(event) => {
                    if (!canDrag || !reorder) return;
                    event.preventDefault();
                    void reorder.onCommit();
                  }}
                  onDragEnd={() => reorder && void reorder.onCommit()}
                  data-dragging={reorder?.dragId === item.id ? "" : undefined}
                  data-testid={
                    reorder ? `shopify-image-${index + 1}` : undefined
                  }
                  className={`group relative overflow-hidden rounded-lg ring-1 ring-border transition data-dragging:opacity-50${
                    canDrag ? " cursor-grab active:cursor-grabbing" : ""
                  }${item.reviewStatus === "rejected" ? " bg-muted opacity-70 grayscale" : ""}${
                    item.reviewStatus === "approved" ? " ring-emerald-200" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onZoom(lightboxImages, index)}
                    className="image-tile w-full cursor-zoom-in rounded-none transition hover:opacity-90"
                  >
                    <img
                      src={item.url}
                      alt={item.label ?? title}
                      draggable={false}
                    />
                  </button>
                  {reorder && item.id ? (
                    <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm">
                      <GripVertical className="size-3.5" />
                      {index + 1}
                    </span>
                  ) : null}
                  {item.onDelete ? (
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      aria-label="Delete image"
                      onClick={item.onDelete}
                      className="absolute top-1.5 right-1.5 bg-background/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                  {item.caption || item.statusLabel || item.reviewable ? (
                    <figcaption className="grid gap-2 px-2 py-2">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        {item.caption ? (
                          <span className="truncate text-xs font-medium">
                            {item.caption}
                          </span>
                        ) : null}
                        {item.statusLabel ? (
                          <StateBadge state={item.statusTone}>
                            {item.statusLabel}
                          </StateBadge>
                        ) : null}
                      </div>
                      {item.reviewable ? (
                        <div className="grid grid-cols-2 gap-1">
                          <Button
                            type="button"
                            aria-label={`Approve ${item.caption ?? item.label ?? "image"}`}
                            title="Approve"
                            variant={
                              item.reviewStatus === "approved"
                                ? "default"
                                : "outline"
                            }
                            size="icon-sm"
                            disabled={item.reviewing}
                            onClick={item.onApprove}
                          >
                            <Check />
                          </Button>
                          <Button
                            type="button"
                            aria-label={`Reject ${item.caption ?? item.label ?? "image"}`}
                            title="Reject"
                            variant={
                              item.reviewStatus === "rejected"
                                ? "destructive"
                                : "outline"
                            }
                            size="icon-sm"
                            disabled={item.reviewing}
                            onClick={item.onReject}
                          >
                            <X />
                          </Button>
                        </div>
                      ) : null}
                    </figcaption>
                  ) : null}
                </figure>
              );
            })
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              {emptyText}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function generatedImageStateLabel(image: Doc<"generatedImages">) {
  if (image.status === "failed") return "Error";
  if (image.status === "canceled") return "Canceled";
  if (image.status === "uploaded") return "Pushed";
  if (!isReviewable(image)) return image.status;
  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "Approved";
  if (reviewStatus === "rejected") return "Rejected";
  return "To review";
}

function generatedImageStateTone(
  image: Doc<"generatedImages">,
): "neutral" | "success" | "warning" | "danger" {
  if (image.status === "failed") return "danger";
  if (image.status === "canceled") return "danger";
  if (image.status === "uploaded") return "success";
  if (!isReviewable(image)) return "warning";
  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return "success";
  if (reviewStatus === "rejected") return "danger";
  return "warning";
}

function GeneratedImageStateBadge({
  image,
}: {
  image: Doc<"generatedImages">;
}) {
  return (
    <StateBadge state={generatedImageStateTone(image)}>
      {generatedImageStateLabel(image)}
    </StateBadge>
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
          <GeneratedImageStateBadge image={image} />
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
