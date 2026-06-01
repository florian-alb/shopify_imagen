import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Send, Trash2, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { BusyIcon, EmptyState, StateBadge, StatusBadge } from "@/components/page";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { productFilterArgs, type ProductSearch, validateProductSearch } from "@/lib/productFilters";
import { generationStatusLabels, shopifyStatusLabel, type GenerationStatus } from "@/lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/$productId")({
  validateSearch: validateProductSearch,
  component: ProductDetailPage
});

type ProductDetail = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
} | null;

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const data = useQuery(api.products.getWithImages, { productId: productId as Id<"products"> }) as ProductDetail | undefined;
  const productNavigation = useQuery(api.products.navigation, {
    productId: productId as Id<"products">,
    ...productFilterArgs(search)
  });
  const prompts = useQuery(api.prompts.list) as Doc<"promptTemplates">[] | undefined;
  const shopInfo = useQuery(api.settings.shopInfo);
  const createJob = useMutation(api.jobs.create);
  const pushImages = useAction(api.shopify.pushProductImages);
  const syncProduct = useAction(api.shopify.syncProduct);
  const deleteImage = useAction(api.shopify.deleteImage);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [selectedPushIds, setSelectedPushIds] = useState<Set<Id<"generatedImages">>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"generatedImages"> | null>(null);

  const openLightbox = useCallback((images: LightboxImage[], index: number) => {
    if (images.length) setLightbox({ images, index });
  }, []);

  const product = data?.product;
  const images = data?.images ?? [];
  const latestJobId = images[0]?.jobId;
  const shopifyAdminUrl = useMemo(() => {
    if (!product || !shopInfo?.storeHandle) return null;
    const numericId = product.shopifyProductId.split("/").pop();
    if (!numericId) return null;
    return `https://admin.shopify.com/store/${shopInfo.storeHandle}/products/${numericId}`;
  }, [product, shopInfo?.storeHandle]);
  const availableTypes = useMemo(() => (prompts ?? []).filter((prompt) => prompt.isActive), [prompts]);
  // Include already-pushed ("uploaded") images so they can be re-pushed, e.g.
  // after regenerating them as optimized WebP.
  const readyImages = images.filter(
    (image) => (image.status === "generated" || image.status === "uploaded") && image.storageUrl
  );

  function openGenerate() {
    // Pre-check preset templates; fall back to all if none are marked preset.
    const presets = availableTypes.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : availableTypes;
    setSelectedTypes(new Set(defaults.map((type) => type.imageType)));
    setForce(false);
    setGenerateOpen(true);
  }

  async function generate() {
    if (!product || !selectedTypes.size) return;
    setBusy("generate");
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(selectedTypes),
        forceRegenerate: force
      });
      setGenerateOpen(false);
      toast.success("Background generation started", {
        description: "Progress updates live on this product.",
        action: { label: "View job", onClick: () => void navigate({ to: "/jobs/$jobId", params: { jobId } }) }
      });
    } catch (jobError) {
      toast.error("Failed to start generation", {
        description: jobError instanceof Error ? jobError.message : String(jobError)
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

  async function sync() {
    if (!product) return;
    setBusy("sync");
    try {
      await syncProduct({ productId: product._id });
      toast.success("Product synced from Shopify");
    } catch (syncError) {
      toast.error("Sync failed", {
        description: syncError instanceof Error ? syncError.message : String(syncError)
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
        description: deleteError instanceof Error ? deleteError.message : String(deleteError)
      });
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    if (!product || !selectedPushIds.size) return;
    const count = selectedPushIds.size;
    setBusy("push");
    try {
      await pushImages({
        productId: product._id,
        imageIds: readyImages.filter((image) => selectedPushIds.has(image._id)).map((image) => image._id),
        replaceExisting
      });
      setPushOpen(false);
      toast.success(`Pushed ${count} image${count === 1 ? "" : "s"} to Shopify`);
    } catch (pushError) {
      toast.error("Push failed", {
        description: pushError instanceof Error ? pushError.message : String(pushError)
      });
    } finally {
      setBusy(null);
    }
  }

  if (data === undefined) {
    return (
      <main className="page">
        <EmptyState loading title="Loading product" body="Fetching product details, Shopify images, and generated image history." />
      </main>
    );
  }

  if (!product) {
    return (
      <main className="page">
        <EmptyState title="Product not found" body="The product may not be synced into Convex yet." />
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
                  <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
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
            <StatusBadge
              status={product.generationStatus as GenerationStatus}
              label={generationStatusLabels[product.generationStatus as GenerationStatus]}
            />
            <Badge variant="outline">{product.productType || "No category"}</Badge>
            {product.shopifyStatus ? <Badge variant="outline">{shopifyStatusLabel(product.shopifyStatus)}</Badge> : null}
            {product.vendor ? <Badge variant="outline">{product.vendor}</Badge> : null}
          </div>
          <h1 className="truncate text-2xl font-semibold sm:text-3xl">{product.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProductNavigationButton direction="previous" product={productNavigation?.previous} search={search} />
            <span className="text-xs text-muted-foreground">
              {productNavigation?.position ? `${productNavigation.position} / ${productNavigation.total}` : `${productNavigation?.total ?? 0} products`}
            </span>
            <ProductNavigationButton direction="next" product={productNavigation?.next} search={search} />
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
          <Button size="lg" variant="outline" onClick={() => void sync()} disabled={busy === "sync"}>
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
          items={product.currentShopifyImages.map((image: any) => ({ url: image.url, label: image.altText ?? "Shopify product" }))}
          emptyText="No images found."
          onZoom={openLightbox}
        />
        <Gallery
          title="Generated images"
          items={images
            .filter((image) => image.storageUrl)
            .map((image) => ({
              url: image.storageUrl!,
              label: image.imageType,
              caption: image.imageType,
              onDelete: () => setDeleteTarget(image)
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
                <HistoryItem key={image._id} image={image} onDelete={() => setDeleteTarget(image)} />
              ))}
            </Accordion>
          ) : (
            <p className="text-sm text-muted-foreground">No generated image records yet.</p>
          )}
        </CardContent>
      </Card>

      <section className="mb-5 px-1 py-3">
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge
            status={product.generationStatus as GenerationStatus}
            label={generationStatusLabels[product.generationStatus as GenerationStatus]}
          />
          <Badge variant="outline">{product.productType || "No category"}</Badge>
          {product.shopifyStatus ? <Badge variant="outline">{shopifyStatusLabel(product.shopifyStatus)}</Badge> : null}
          {product.vendor ? <Badge variant="outline">{product.vendor}</Badge> : null}
        </div>
        <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          <Fact label="Collections" value={product.collections.map((collection: any) => collection.title).join(", ") || "None"} />
          <Fact label="Shopify status" value={shopifyStatusLabel(product.shopifyStatus)} />
          <Fact label="Last synced" value={product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString() : "Never"} />
          <Fact label="Generated history" value={`${images.length} image records`} />
        </dl>
      </section>

      <div className="sticky-actions">
        <Card size="sm" className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-md">
          <div>
            <p className="text-sm font-medium">{readyImages.length} generated image{readyImages.length === 1 ? "" : "s"} ready</p>
            <p className="text-xs text-muted-foreground">Push is manual and requires confirmation.</p>
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
        force={force}
        onForceChange={setForce}
        busy={busy === "generate"}
        onGenerate={() => void generate()}
      />

      <AlertDialog open={pushOpen} onOpenChange={setPushOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Push generated images to Shopify?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which images to upload. Existing Shopify media stays intact unless you explicitly enable replacement below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedPushIds.size} of {readyImages.length} selected
            </span>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={readyImages.length > 0 && selectedPushIds.size === readyImages.length}
                onCheckedChange={(checked) =>
                  setSelectedPushIds(checked === true ? new Set(readyImages.map((image) => image._id)) : new Set())
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
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{image.imageType}</span>
                {image.status === "uploaded" ? <Badge variant="outline">Pushed</Badge> : null}
              </Label>
            ))}
          </div>
          <Label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={replaceExisting}
              onCheckedChange={(checked) => setReplaceExisting(checked === true)}
            />
            <span>Replace current Shopify gallery after upload</span>
          </Label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "push"}>Cancel</AlertDialogCancel>
            <Button disabled={busy === "push" || !selectedPushIds.size} onClick={() => void push()}>
              <BusyIcon busy={busy === "push"} />
              Push {selectedPushIds.size} image{selectedPushIds.size === 1 ? "" : "s"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Lightbox
        state={lightbox}
        onIndexChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
        onClose={() => setLightbox(null)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              The <strong>{deleteTarget?.imageType}</strong> image will be removed from storage, from Shopify if it was
              pushed, and from this product's history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy === "delete"} onClick={() => void confirmDelete()}>
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
  search
}: {
  direction: "previous" | "next";
  product: Doc<"products"> | null | undefined;
  search: ProductSearch;
}) {
  const label = direction === "previous" ? "Previous" : "Next";
  const icon = direction === "previous" ? <ChevronLeft data-icon="inline-start" /> : <ChevronRight data-icon="inline-end" />;
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
      <Link to="/products/$productId" params={{ productId: product._id }} search={search} title={product.title}>
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
  onClose
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
    [index, images.length, onIndexChange]
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
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none sm:p-10"
          onClick={onClose}
        >
          <DialogPrimitive.Title className="sr-only">{current?.label ?? "Image preview"}</DialogPrimitive.Title>
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
  force,
  onForceChange,
  busy,
  onGenerate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Doc<"promptTemplates">[];
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  force: boolean;
  onForceChange: (checked: boolean) => void;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate images</DialogTitle>
          <DialogDescription>Select image types for this product. Each type maps to a prompt template.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="flex h-8 items-center gap-2 rounded-lg border px-3">
            <Checkbox checked={force} onCheckedChange={(checked) => onForceChange(checked === true)} />
            Regenerate existing
          </Label>
        </div>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label key={type.imageType} className="flex min-h-11 justify-between rounded-lg border px-3">
              <span>{type.label}</span>
              <Checkbox checked={selectedTypes.has(type.imageType)} onCheckedChange={() => onToggle(type.imageType)} />
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
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

type GalleryItem = { url: string; label?: string; caption?: string; onDelete?: () => void };

function Gallery({
  title,
  items,
  emptyText,
  onZoom
}: {
  title: string;
  items: GalleryItem[];
  emptyText: string;
  onZoom: (images: LightboxImage[], index: number) => void;
}) {
  const lightboxImages = items.map((item) => ({ url: item.url, label: item.label }));
  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <StateBadge>{items.length}</StateBadge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.length ? (
            items.map((item, index) => (
              <figure key={`${item.url}-${index}`} className="group relative overflow-hidden rounded-lg ring-1 ring-border">
                <button
                  type="button"
                  onClick={() => onZoom(lightboxImages, index)}
                  className="image-tile w-full cursor-zoom-in rounded-none transition hover:opacity-90"
                >
                  <img src={item.url} alt={item.label ?? title} />
                </button>
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
                {item.caption ? <figcaption className="px-2 py-2 text-xs font-medium">{item.caption}</figcaption> : null}
              </figure>
            ))
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryItem({ image, onDelete }: { image: Doc<"generatedImages">; onDelete: () => void }) {
  const state = image.status === "failed" ? "danger" : image.status === "generated" || image.status === "uploaded" ? "success" : "warning";
  const providerLabel = image.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI";
  return (
    <AccordionItem value={image._id} className="rounded-lg border px-3 last:border-b">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2">
          {image.imageType}
          <Separator orientation="vertical" className="h-4" />
          <StateBadge state={state}>{image.status}</StateBadge>
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
            <a className="break-all text-sm underline underline-offset-4" href={image.storageUrl} target="_blank" rel="noreferrer">
              {image.storageUrl}
            </a>
          ) : null}
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{image.promptUsed}</pre>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 data-icon="inline-start" />
              Delete everywhere
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
