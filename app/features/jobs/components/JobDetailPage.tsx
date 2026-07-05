import { Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Send,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ImageRetouchDialog,
  type RetouchSaveMode,
  type RetouchTarget,
} from "@/components/image-retouch-dialog";
import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import { BusyIcon, EmptyState, PageHeader, StateBadge } from "@/components/page";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { GeneratedImageTile } from "@/features/images/components/GeneratedImageTile";
import {
  getReviewStatus,
  isReviewable,
  reviewAggregateBadge,
  type ReviewStatus,
} from "@/features/images/lib/review";
import { getShopifyAdminUrl } from "@/features/shopify/lib/admin";
import { api, type Doc, type Id } from "@/lib/convex";
import { formatUsd } from "@/lib/formatters";
import { useJobDetail } from "../hooks/useJobDetail";
import { useJobImagePublish } from "../hooks/useJobImagePublish";
import { useJobImageRegeneration } from "../hooks/useJobImageRegeneration";
import { useJobImageReview } from "../hooks/useJobImageReview";

type ReviewFilter = "all" | ReviewStatus | "failed" | "pushed";

const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Errors" },
  { value: "pushed", label: "Pushed" }
];

function matchesFilter(image: Doc<"generatedImages">, filter: ReviewFilter) {
  if (filter === "all") return true;
  if (filter === "failed") return image.status === "failed";
  if (filter === "pushed") return image.status === "uploaded";
  return isReviewable(image) && getReviewStatus(image) === filter;
}

function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

function executionModeRateLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "50% rate" : "Full rate";
}

function imageDisplayCost(image: Doc<"generatedImages">, job: Doc<"generationJobs">) {
  const cost = image.costUsd ?? 0;
  const generationCost =
    job.executionMode === "batch" && image.costRateMultiplier == null
      ? cost * 0.5
      : cost;
  return generationCost + (image.backgroundRemovalCostUsd ?? 0);
}

export function JobDetailPage({ jobId }: { jobId: string }) {
  const { data, shopInfo } = useJobDetail(jobId);
  const retryJob = useMutation(api.jobs.retry);
  const generateRetouchUploadUrl = useMutation(api.jobs.generateRetouchUploadUrl);
  const pollJob = useAction(api.generation.pollJob);
  const cancelJob = useAction(api.generation.cancelJob);
  const prepareRetouchSource = useAction(api.retouch.prepareRetouchSource);
  const saveRetouchedImage = useAction(api.retouch.saveRetouchedImage);
  const { reviewing, setReview } = useJobImageReview();
  const {
    regeneratingId,
    regenerationTarget,
    regenerationInstructions,
    setRegenerationInstructions,
    openRegeneration,
    closeRegeneration,
    regenerate,
    retryImage,
  } = useJobImageRegeneration({
    onOpen: () => setPreviewId(null),
  });
  const {
    pushOpen,
    setPushOpen,
    replaceExisting,
    setReplaceExisting,
    pushing,
    pushedProducts,
    pushApproved,
  } = useJobImagePublish();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [previewId, setPreviewId] = useState<Id<"generatedImages"> | null>(null);
  const [retouchTarget, setRetouchTarget] = useState<RetouchTarget | null>(null);
  const [retouchSaving, setRetouchSaving] = useState(false);
  const [pushTargetProductId, setPushTargetProductId] = useState<Id<"products"> | null>(null);

  if (data === undefined) {
    return (
      <main className="page">
        <EmptyState loading title="Loading job" body="Realtime job progress is coming from Convex." />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <EmptyState title="Job not found" body="The generation job could not be found." />
      </main>
    );
  }

  const { job, images, products } = data;
  const reviewableImages = images.filter(isReviewable);
  const approvedImages = reviewableImages.filter((image) => getReviewStatus(image) === "approved");
  const pushableImages = approvedImages.filter((image) => image.status === "generated");
  const pendingCount = reviewableImages.filter((image) => getReviewStatus(image) === "pending").length;
  const approvedCount = approvedImages.length;
  const rejectedCount = reviewableImages.filter((image) => getReviewStatus(image) === "rejected").length;
  const failedCount = images.filter((image) => image.status === "failed").length;
  const pushedCount = images.filter((image) => image.status === "uploaded").length;
  const visibleImages = images.filter((image) => matchesFilter(image, filter));
  const visibleReviewable = visibleImages.filter(isReviewable);
  const productRows = products
    .map((product) => ({
      product,
      images: visibleImages.filter((image) => image.productId === product._id)
    }))
    .filter((row) => row.images.length > 0);
  const previewImages = reviewableImages.filter((image) => image.storageUrl);
  const previewImage = previewImages.find((image) => image._id === previewId) ?? null;
  const previewIndex = previewImage ? previewImages.findIndex((image) => image._id === previewImage._id) : -1;
  const pushTargetProduct = pushTargetProductId
    ? products.find((product) => product._id === pushTargetProductId) ?? null
    : null;
  const selectedPushableImages = pushTargetProductId
    ? pushableImages.filter((image) => image.productId === pushTargetProductId)
    : pushableImages;
  const selectedPushProductCount = new Set(selectedPushableImages.map((image) => image.productId)).size;
  const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
  const jobState = job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning";
  const canCancelJob = job.status === "queued" || job.status === "running";
  const canForcePoll = job.executionMode === "batch" && Boolean(job.batchId) && job.status === "running";
  const jobCost = images.reduce((sum, image) => sum + imageDisplayCost(image, job), 0);
  const reviewBadge = reviewAggregateBadge({
    total: reviewableImages.length,
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
  });

  async function handleForcePoll() {
    setPolling(true);
    try {
      const result = await pollJob({ jobId: job._id });
      if (result.state === "pending") {
        toast.info(`Batch still processing${result.batchStatus ? ` (${result.batchStatus})` : ""}. No results yet.`);
      } else if (result.state === "busy") {
        toast.info("Batch results are already being ingested.");
      } else if (result.state === "failed") {
        toast.error(`Batch failed: ${result.error}`);
      } else if (result.state === "cancelled") {
        toast.info("Batch cancelled.");
      } else if (result.state === "partial") {
        toast.success(`Progress: ${result.ingested} image(s) ingested, ${result.failed} failed. The next chunk will continue automatically.`);
      } else {
        toast.success(`Done: ${result.ingested} image(s) ingested, ${result.failed} failed.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

async function handleCancelJob() {
  setCancelling(true);
  try {
    const result = await cancelJob({ jobId: job._id });
    toast.info(`Job cancelled${result.batchStatus ? ` (${result.batchStatus})` : ""}.`);
    } catch (error) {
      toast.error("Cancel failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
    setCancelling(false);
  }
}

async function handleRetryJob() {
  setRetrying(true);
  try {
    await retryJob({ jobId: job._id });
    toast.success("Retry started");
  } catch (error) {
    toast.error("Retry failed", {
      description: error instanceof Error ? error.message : String(error),
    });
  } finally {
    setRetrying(false);
  }
}

function openRetouch(image: Doc<"generatedImages">) {
    if (!image.storageUrl) return;
    setRetouchTarget({
      id: image._id,
      url: image.storageUrl,
      label: image.imageType,
    });
  }

  async function saveRetouch(target: RetouchTarget, blob: Blob, mode: RetouchSaveMode) {
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

      const retouchedImageId = await saveRetouchedImage({
        sourceImageId: target.id,
        storageId: payload.storageId as Id<"_storage">,
        contentType: blob.type || "image/png",
        saveMode: mode,
      });
      setRetouchTarget(null);
      setPreviewId(retouchedImageId);
      toast.success(
        mode === "overwrite"
          ? "Image retouchee enregistree"
          : "Version retouchee enregistree",
        {
          description:
            mode === "overwrite"
              ? "L'image existante est remplacee et repasse en attente de validation."
              : "Elle est ajoutee en attente de validation.",
        },
      );
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

  function movePreview(delta: number) {
    if (!previewImages.length || previewIndex < 0) return;
    const next = (previewIndex + delta + previewImages.length) % previewImages.length;
    setPreviewId(previewImages[next]._id);
  }

  return (
    <main className="page">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3 text-muted-foreground" asChild>
        <Link to="/jobs">
          <ArrowLeft data-icon="inline-start" />
          Generations
        </Link>
      </Button>
      <PageHeader
        eyebrow={job.mode === "bulk" ? "Operation bulk" : "Operation produit"}
        title={`Job ${job._id.slice(-6)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state="neutral">{executionModeLabel(job.executionMode)}</StateBadge>
            <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
            <StateBadge state={jobState}>{job.status}</StateBadge>
            {job.batchStatus ? <StateBadge>{job.batchStatus}</StateBadge> : null}
            <StateBadge state={reviewBadge.tone}>{reviewBadge.label}</StateBadge>
            {canForcePoll ? (
              <Button size="sm" variant="outline" onClick={handleForcePoll} disabled={polling}>
                {polling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Zap data-icon="inline-start" />}
              Poll
              </Button>
            ) : null}
            {canCancelJob ? (
              <Button size="sm" variant="outline" onClick={handleCancelJob} disabled={cancelling}>
                {cancelling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <X data-icon="inline-start" />}
              Annuler
              </Button>
            ) : null}
            {job.status === "failed" || job.status === "cancelled" ? (
              <Button size="sm" variant="outline" onClick={handleRetryJob} disabled={retrying}>
                {retrying ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
                Relancer
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="studio-card mb-5 rounded-lg">
        <CardContent className="pt-1">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
            <span>{pct}% termine</span>
            <span className="text-muted-foreground">
              {job.completedTasks} succes / {job.failedTasks} echecs / {job.totalTasks} total · {formatUsd(jobCost)} · {executionModeRateLabel(job.executionMode)}
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          {job.error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <JobReviewSection
        executionMode={job.executionMode}
        images={images}
        filter={filter}
        visibleReviewable={visibleReviewable}
        reviewing={reviewing}
        counts={{
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          failed: failedCount,
          pushed: pushedCount,
        }}
        onFilterChange={setFilter}
        onApproveVisible={() => void setReview(visibleReviewable.map((image) => image._id), "approved")}
      />

      {productRows.length ? (
        <section className="grid gap-4">
        {productRows.map(({ product, images: rowImages }) => {
          const productPushableCount = pushableImages.filter((image) => image.productId === product._id).length;

          return (
            <JobProductReviewCard
              key={product._id}
              product={product}
              shopifyAdminUrl={getShopifyAdminUrl(product, shopInfo?.storeHandle)}
              images={rowImages}
              reviewing={reviewing}
              retrying={retrying}
              publishing={pushing && pushTargetProductId === product._id}
              publishDisabled={pushing}
              publishableCount={productPushableCount}
              regeneratingId={regeneratingId}
              onPreview={setPreviewId}
              onReview={(imageIds, reviewStatus) => void setReview(imageIds, reviewStatus)}
              onPublishApproved={() => {
                setPushTargetProductId(product._id);
                setPushOpen(true);
              }}
              onRegenerate={openRegeneration}
              onRetouch={openRetouch}
              onRetry={(image) => void retryImage(image)}
            />
          );
        })}
        </section>
      ) : (
        <EmptyState title="No images in this view" body="Choose another review filter to see the rest of this batch." />
      )}

      <details className="mt-5 rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium">Technical details</summary>
        <div className="mt-4 grid gap-2">
          {images.map((image) => (
            <div key={image._id} className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="font-medium">{image.imageType}</p>
                <p className="text-xs text-muted-foreground">
                  {image.status} · Created {new Date(image.createdAt).toLocaleString()}
                  {image.costUsd != null ? ` · ${formatUsd(imageDisplayCost(image, job))} (${((image.inputTokens ?? 0) + (image.outputTokens ?? 0)).toLocaleString()} tok)` : ""}
                </p>
                {image.providerBatchId || image.providerRequestId || image.providerResponseId ? (
                  <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    {image.providerBatchId ? (
                      <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                        <dt>Batch ID</dt>
                        <dd className="truncate font-mono">{image.providerBatchId}</dd>
                      </div>
                    ) : null}
                    {image.providerRequestId ? (
                      <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                        <dt>Request ID</dt>
                        <dd className="truncate font-mono">{image.providerRequestId}</dd>
                      </div>
                    ) : null}
                    {image.providerResponseId ? (
                      <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                        <dt>Response ID</dt>
                        <dd className="truncate font-mono">{image.providerResponseId}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {image.error ? <p className="mt-1 text-sm text-destructive">{image.error}</p> : null}
                {image.storageUrl ? (
                  <a className="mt-1 block truncate text-xs underline underline-offset-4" href={image.storageUrl} target="_blank" rel="noreferrer">
                    {image.storageUrl}
                  </a>
                ) : null}
              </div>
              <ImageStateBadge image={image} />
            </div>
          ))}
        </div>
      </details>

      {reviewableImages.length ? (
        <div className="sticky-actions">
          <Card size="sm" className="studio-card flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {approvedCount} approuvees · {pendingCount} a verifier · {rejectedCount} rejetees
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {pushableImages.length ? `${pushableImages.length} image${pushableImages.length === 1 ? "" : "s"} prete${pushableImages.length === 1 ? "" : "s"} a publier` : "Aucune nouvelle image a publier"}
              </p>
            </div>
            <Button
              disabled={!pushableImages.length}
              onClick={() => {
                setPushTargetProductId(null);
                setPushOpen(true);
              }}
            >
              <Send data-icon="inline-start" />
              Publier {pushableImages.length || ""}
            </Button>
          </Card>
        </div>
      ) : null}

      <ImageReviewPreviewDialog
        image={previewImage}
        index={previewIndex}
        total={previewImages.length}
        reviewing={reviewing}
        regenerating={previewImage?._id === regeneratingId}
        onClose={() => setPreviewId(null)}
        onMove={movePreview}
        onReview={(reviewStatus) => previewImage && void setReview([previewImage._id], reviewStatus)}
        onRegenerate={() => previewImage && openRegeneration(previewImage)}
        onRetouch={() => previewImage && openRetouch(previewImage)}
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

      <RegenerateImageDialog
        image={regenerationTarget}
        instructions={regenerationInstructions}
        regenerating={regenerationTarget?._id === regeneratingId}
        onInstructionsChange={setRegenerationInstructions}
        onClose={closeRegeneration}
        onRegenerate={() => void regenerate()}
      />

      <AlertDialog
        open={pushOpen}
        onOpenChange={(open) => {
          if (pushing) return;
          setPushOpen(open);
          if (!open) setPushTargetProductId(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pushTargetProduct ? "Push this product's approved images?" : "Push approved images to Shopify?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pushTargetProduct ? (
                <>
                  This will upload {selectedPushableImages.length} approved image{selectedPushableImages.length === 1 ? "" : "s"} for {pushTargetProduct.title}. Rejected, unreviewed, and already-published images will stay untouched.
                </>
              ) : (
                <>
                  This will upload {selectedPushableImages.length} approved image{selectedPushableImages.length === 1 ? "" : "s"} across {selectedPushProductCount} product
                  {selectedPushProductCount === 1 ? "" : "s"}. Rejected, unreviewed, and already-published images will stay untouched.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={replaceExisting}
              disabled={pushing}
              onCheckedChange={(checked) => setReplaceExisting(checked === true)}
            />
            <span>
              <strong className="block text-sm">Replace current Shopify galleries</strong>
              <span className="mt-1 block text-xs text-muted-foreground">Existing Shopify media will be deleted after each successful upload.</span>
            </span>
          </Label>
          {pushing ? (
            <div>
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>Publishing products</span>
                <span>{pushedProducts} / {selectedPushProductCount}</span>
              </div>
              <Progress value={selectedPushProductCount ? (pushedProducts / selectedPushProductCount) * 100 : 0} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pushing}>Cancel</AlertDialogCancel>
            <Button
              disabled={pushing || !selectedPushableImages.length}
              onClick={() => void pushApproved({
                products,
                pushableImages: selectedPushableImages,
                successMessage: pushTargetProduct
                  ? `${selectedPushableImages.length} image${selectedPushableImages.length === 1 ? "" : "s"} pushed for ${pushTargetProduct.title}`
                  : undefined,
              }).then((success) => {
                if (success) setPushTargetProductId(null);
              })}
            >
              <BusyIcon busy={pushing} />
              {!pushing ? <Send data-icon="inline-start" /> : null}
              Push {selectedPushableImages.length} image{selectedPushableImages.length === 1 ? "" : "s"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function JobReviewSection({
  executionMode,
  images,
  filter,
  visibleReviewable,
  reviewing,
  counts,
  onFilterChange,
  onApproveVisible,
}: {
  executionMode?: "realtime" | "batch";
  images: Doc<"generatedImages">[];
  filter: ReviewFilter;
  visibleReviewable: Doc<"generatedImages">[];
  reviewing: boolean;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    failed: number;
    pushed: number;
  };
  onFilterChange: (filter: ReviewFilter) => void;
  onApproveVisible: () => void;
}) {
  return (
    <section className="studio-card mb-4 rounded-lg border p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{executionModeLabel(executionMode)} review</p>
          <h2 className="text-xl font-semibold">Review des images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approuvez les images publier. Les rejets restent disponibles comme reference.
          </p>
        </div>
        <Button variant="outline" disabled={!visibleReviewable.length || reviewing} onClick={onApproveVisible}>
          <Check data-icon="inline-start" />
          Approuver visibles
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {reviewFilters.map((item) => {
          const count =
            item.value === "all"
              ? images.length
              : item.value === "pending"
                ? counts.pending
                : item.value === "approved"
                  ? counts.approved
                  : item.value === "rejected"
                    ? counts.rejected
                    : item.value === "failed"
                      ? counts.failed
                      : counts.pushed;

          return (
            <Button
              key={item.value}
              variant={filter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(item.value)}
            >
              {item.label} {count}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function RegenerateImageDialog({
  image,
  instructions,
  regenerating,
  onInstructionsChange,
  onClose,
  onRegenerate
}: {
  image: Doc<"generatedImages"> | null;
  instructions: string;
  regenerating: boolean;
  onInstructionsChange: (value: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Regenerate {image?.imageType}</DialogTitle>
          <DialogDescription>
            Add a correction to the existing prompt so the next image fixes what was wrong. Leave the field empty to regenerate with the original prompt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="regeneration-instructions">Correction instructions</Label>
          <Textarea
            id="regeneration-instructions"
            value={instructions}
            disabled={regenerating}
            maxLength={2000}
            rows={5}
            placeholder="Example: The curtain must be much more opaque. Do not show sunlight, the window frame, or any background through the fabric."
            onChange={(event) => onInstructionsChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{instructions.length} / 2000 characters</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={regenerating} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={regenerating} onClick={onRegenerate}>
            {regenerating ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobProductReviewCard({
  product,
  shopifyAdminUrl,
  images,
  reviewing,
  retrying,
  publishing,
  publishDisabled,
  publishableCount,
  regeneratingId,
  onPreview,
  onReview,
  onPublishApproved,
  onRegenerate,
  onRetouch,
  onRetry
}: {
 product: Doc<"products">;
 shopifyAdminUrl: string | null;
  images: Doc<"generatedImages">[];
  reviewing: boolean;
  retrying: boolean;
  publishing: boolean;
  publishDisabled: boolean;
  publishableCount: number;
  regeneratingId: Id<"generatedImages"> | null;
  onPreview: (imageId: Id<"generatedImages">) => void;
  onReview: (imageIds: Id<"generatedImages">[], reviewStatus: "approved" | "rejected") => void;
  onPublishApproved: () => void;
  onRegenerate: (image: Doc<"generatedImages">) => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onRetry: (image: Doc<"generatedImages">) => void;
}) {
  const reviewable = images.filter(isReviewable);
  const approved = reviewable.filter((image) => getReviewStatus(image) === "approved").length;
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{product.title}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{product.handle}</span>
            <span>·</span>
            <span>{approved} / {reviewable.length} approved</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/products/$productId" params={{ productId: product._id }}>
              <ExternalLink data-icon="inline-start" />
              Product
            </Link>
          </Button>
          {shopifyAdminUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Shopify
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!reviewable.length || reviewing}
            onClick={() => onReview(reviewable.map((image) => image._id), "approved")}
          >
            <Check data-icon="inline-start" />
            Approve all
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!publishableCount || publishDisabled}
            onClick={onPublishApproved}
          >
            {publishing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}
            Publish {publishableCount || ""}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {images.map((image) => (
            <GeneratedImageTile
              key={image._id}
              image={image}
              reviewing={reviewing}
              retrying={retrying}
              regenerating={regeneratingId === image._id}
              onPreview={() => onPreview(image._id)}
              onReview={(reviewStatus) => onReview([image._id], reviewStatus)}
              onRegenerate={() => onRegenerate(image)}
              onRetouch={() => onRetouch(image)}
              onRetry={() => onRetry(image)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ImageReviewPreviewDialog({
  image,
  index,
  total,
  reviewing,
  regenerating,
  onClose,
  onMove,
  onReview,
  onRegenerate,
  onRetouch
}: {
  image: Doc<"generatedImages"> | null;
  index: number;
  total: number;
  reviewing: boolean;
  regenerating: boolean;
  onClose: () => void;
  onMove: (delta: number) => void;
  onReview: (reviewStatus: "approved" | "rejected") => void;
  onRegenerate: () => void;
  onRetouch: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        {image ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {image.imageType}
                <ImageStateBadge image={image} />
              </DialogTitle>
              <DialogDescription>
                Compare the Shopify reference with the generated image before approving it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <ComparisonImage label="Shopify reference" url={image.sourceImageUrl} />
              <ComparisonImage label="Generated image" url={image.storageUrl} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={total < 2} onClick={() => onMove(-1)}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">{index + 1} / {total}</span>
              <Button variant="outline" size="sm" disabled={total < 2} onClick={() => onMove(1)}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
            <DialogFooter className="flex-col sm:flex-row">
              <Button variant="destructive" disabled={reviewing} onClick={() => onReview("rejected")}>
                <X data-icon="inline-start" />
                Reject
              </Button>
              <Button variant="outline" disabled={regenerating} onClick={onRegenerate}>
                {regenerating ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RotateCcw data-icon="inline-start" />}
                Regenerate
              </Button>
              <Button variant="outline" disabled={!image.storageUrl} onClick={onRetouch}>
                <Paintbrush data-icon="inline-start" />
                Retoucher
              </Button>
              <Button disabled={reviewing} onClick={() => onReview("approved")}>
                <Check data-icon="inline-start" />
                Approve
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ComparisonImage({ label, url }: { label: string; url?: string | null }) {
  return (
    <figure className="overflow-hidden rounded-lg border bg-muted/50">
      <figcaption className="border-b bg-background px-3 py-2 text-xs font-medium uppercase text-muted-foreground">{label}</figcaption>
      <div className="grid min-h-64 place-items-center p-2">
        {url ? <img src={url} alt={label} className="max-h-[55vh] w-full rounded-md object-contain" /> : <span className="text-sm text-muted-foreground">No image available</span>}
      </div>
    </figure>
  );
}
