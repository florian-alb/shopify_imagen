import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Send, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
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
import { getAvailableImageTypes, getBudgetImageTypes } from "@/lib/fixationDetector";
import { IMAGE_TYPE_LABELS, type ImageType } from "@/lib/imageTypes";
import { generationStatusLabels, type GenerationStatus } from "@/lib/status";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/products/$productId")({
  component: ProductDetailPage
});

type ProductDetail = {
  product: Doc<"products">;
  images: Doc<"generatedImages">[];
} | null;

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const data = useQuery(api.products.getWithImages, { productId: productId as Id<"products"> }) as ProductDetail | undefined;
  const createJob = useMutation(api.jobs.create);
  const pushImages = useAction(api.shopify.pushProductImages);
  const [selectedTypes, setSelectedTypes] = useState<Set<ImageType>>(new Set());
  const [force, setForce] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<Id<"generationJobs"> | null>(null);

  const product = data?.product;
  const images = data?.images ?? [];
  const availableTypes = useMemo(() => getAvailableImageTypes(product?.detectedFixations ?? []), [product?.detectedFixations]);
  // Include already-pushed ("uploaded") images so they can be re-pushed, e.g.
  // after regenerating them as optimized WebP.
  const readyImages = images.filter(
    (image) => (image.status === "generated" || image.status === "uploaded") && image.storageUrl
  );

  function openGenerate() {
    setSelectedTypes(new Set(getBudgetImageTypes(product?.detectedFixations ?? [])));
    setForce(false);
    setGenerateOpen(true);
  }

  async function generate() {
    if (!product || !selectedTypes.size) return;
    setBusy("generate");
    setError(null);
    setCreatedJobId(null);
    try {
      const jobId = await createJob({
        productIds: [product._id],
        selectedImageTypes: Array.from(selectedTypes),
        forceRegenerate: force
      });
      setGenerateOpen(false);
      setCreatedJobId(jobId);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : String(jobError));
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    if (!product) return;
    setBusy("push");
    setError(null);
    try {
      await pushImages({
        productId: product._id,
        imageIds: readyImages.map((image) => image._id),
        replaceExisting
      });
      setPushOpen(false);
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : String(pushError));
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
                    <Link to="/products">
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
            {product.vendor ? <Badge variant="outline">{product.vendor}</Badge> : null}
          </div>
          <h1 className="truncate text-2xl font-semibold sm:text-3xl">{product.title}</h1>
        </div>
        <Button size="lg" onClick={openGenerate}>
          <WandSparkles data-icon="inline-start" />
          Generate
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {createdJobId ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Background generation started. Progress updates live on this product.</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: createdJobId }}>View job</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <ShopifyGallery images={product.currentShopifyImages} />
        <GeneratedGallery images={images} />
      </section>

      <Card className="mb-4 rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg">Prompt and image history</CardTitle>
        </CardHeader>
        <CardContent>
          {images.length ? (
            <Accordion type="multiple" className="gap-3">
              {images.map((image) => (
                <HistoryItem key={image._id} image={image} />
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
          {product.vendor ? <Badge variant="outline">{product.vendor}</Badge> : null}
        </div>
        <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          <Fact label="Detected fixations" value={product.detectedFixations.join(", ") || "None"} />
          <Fact label="Collections" value={product.collections.map((collection: any) => collection.title).join(", ") || "None"} />
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
          <Button disabled={!readyImages.length} onClick={() => setPushOpen(true)}>
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
        onBudget={() => setSelectedTypes(new Set(getBudgetImageTypes(product.detectedFixations)))}
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
              Approved images will be uploaded. Existing Shopify media stays intact unless you explicitly enable replacement below.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            <Button disabled={busy === "push"} onClick={() => void push()}>
              <BusyIcon busy={busy === "push"} />
              Confirm push
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  onToggle,
  onBudget,
  force,
  onForceChange,
  busy,
  onGenerate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ImageType[];
  selectedTypes: Set<ImageType>;
  onToggle: (type: ImageType) => void;
  onBudget: () => void;
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
          <DialogDescription>Select image types for this product. Available fixation views were detected during sync.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onBudget}>Budget preset</Button>
          <Label className="flex h-8 items-center gap-2 rounded-lg border px-3">
            <Checkbox checked={force} onCheckedChange={(checked) => onForceChange(checked === true)} />
            Regenerate existing
          </Label>
        </div>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label key={type} className="flex min-h-11 justify-between rounded-lg border px-3">
              <span>{IMAGE_TYPE_LABELS[type]}</span>
              <Checkbox checked={selectedTypes.has(type)} onCheckedChange={() => onToggle(type)} />
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

function ShopifyGallery({ images }: { images: any[] }) {
  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Current Shopify images</CardTitle>
        <StateBadge>{images.length}</StateBadge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.length ? (
            images.map((image, index) => (
              <figure key={`${image.url}-${index}`} className="image-tile ring-1 ring-border">
                <img src={image.url} alt={image.altText ?? "Shopify product"} />
              </figure>
            ))
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">No images found.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratedGallery({ images }: { images: Doc<"generatedImages">[] }) {
  const generated = images.filter((image) => image.storageUrl);
  return (
    <Card className="min-h-72 rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Generated images</CardTitle>
        <StateBadge>{generated.length}</StateBadge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {generated.length ? (
            generated.map((image) => (
              <figure key={image._id} className="overflow-hidden rounded-lg ring-1 ring-border">
                <div className="image-tile rounded-none">
                  <img src={image.storageUrl!} alt={image.imageType} />
                </div>
                <figcaption className="px-2 py-2 text-xs font-medium">{image.imageType}</figcaption>
              </figure>
            ))
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">No generated images yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryItem({ image }: { image: Doc<"generatedImages"> }) {
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
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
