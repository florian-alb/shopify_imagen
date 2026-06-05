import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Images,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailPage
});

type JobDetail = {
  job: Doc<"generationJobs">;
  images: Doc<"generatedImages">[];
  products: Doc<"products">[];
} | null;

type ReviewStatus = "pending" | "approved" | "rejected";
type ReviewFilter = "all" | ReviewStatus | "failed" | "pushed";
type ReviewAggregateState = "none" | "pending" | "approved" | "partial" | "rejected";

const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Errors" },
  { value: "pushed", label: "Pushed" }
];

function getReviewStatus(image: Doc<"generatedImages">): ReviewStatus {
  return image.reviewStatus ?? "pending";
}

function isReviewable(image: Doc<"generatedImages">) {
  return Boolean(image.storageUrl) && (image.status === "generated" || image.status === "uploaded");
}

function matchesFilter(image: Doc<"generatedImages">, filter: ReviewFilter) {
  if (filter === "all") return true;
  if (filter === "failed") return image.status === "failed";
  if (filter === "pushed") return image.status === "uploaded";
  return isReviewable(image) && getReviewStatus(image) === filter;
}

function getReviewAggregateState(total: number, pending: number, approved: number, rejected: number): ReviewAggregateState {
  if (total === 0) return "none";
  if (pending > 0) return "pending";
  if (rejected === total) return "rejected";
  if (approved === total) return "approved";
  return "partial";
}

function reviewAggregateBadge(total: number, pending: number, approved: number, rejected: number) {
  const state = getReviewAggregateState(total, pending, approved, rejected);
  if (state === "pending") return { tone: "warning" as const, label: `${pending} to review` };
  if (state === "approved") return { tone: "success" as const, label: "Approved" };
  if (state === "partial") return { tone: "warning" as const, label: "Partial" };
  if (state === "rejected") return { tone: "danger" as const, label: "Rejected" };
  return { tone: "neutral" as const, label: "No review" };
}

function formatUsd(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function executionModeLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "Batch" : "Real-time";
}

function executionModeRateLabel(mode?: "realtime" | "batch") {
  return mode === "batch" ? "50% rate" : "Full rate";
}

function imageDisplayCost(image: Doc<"generatedImages">, job: Doc<"generationJobs">) {
  const cost = image.costUsd ?? 0;
  if (job.executionMode === "batch" && image.costRateMultiplier == null) return cost * 0.5;
  return cost;
}

function getShopifyAdminUrl(product: Doc<"products">, storeHandle?: string | null) {
  if (!storeHandle) return null;
  const numericId = product.shopifyProductId.split("/").pop();
  if (!numericId) return null;
  return `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`;
}

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const data = useQuery(api.jobs.get, { jobId: jobId as Id<"generationJobs"> }) as JobDetail | undefined;
  const shopInfo = useQuery(api.settings.shopInfo);
  const retryJob = useMutation(api.jobs.retry);
  const reviewImages = useMutation(api.jobs.reviewImages);
  const createJob = useMutation(api.jobs.create);
  const pollJob = useAction(api.generation.pollJob);
  const cancelJob = useAction(api.generation.cancelJob);
  const pushImages = useAction(api.shopify.pushProductImages);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<Id<"generatedImages"> | null>(null);
  const [regenerationTarget, setRegenerationTarget] = useState<Doc<"generatedImages"> | null>(null);
  const [regenerationInstructions, setRegenerationInstructions] = useState("");
  const [previewId, setPreviewId] = useState<Id<"generatedImages"> | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushedProducts, setPushedProducts] = useState(0);

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
  const pushProductCount = new Set(pushableImages.map((image) => image.productId)).size;
  const pct = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks) / job.totalTasks) * 100) : 0;
  const jobState = job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning";
  const canCancelJob = job.status === "queued" || job.status === "running";
  const jobCost = images.reduce((sum, image) => sum + imageDisplayCost(image, job), 0);
  const reviewBadge = reviewAggregateBadge(reviewableImages.length, pendingCount, approvedCount, rejectedCount);

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

  async function setReview(imageIds: Id<"generatedImages">[], reviewStatus: "approved" | "rejected") {
    if (!imageIds.length) return;
    setReviewing(true);
    try {
      await reviewImages({ imageIds, reviewStatus });
    } catch (error) {
      toast.error("Review update failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setReviewing(false);
    }
  }

  function openRegeneration(image: Doc<"generatedImages">) {
    setPreviewId(null);
    setRegenerationInstructions("");
    setRegenerationTarget(image);
  }

  async function regenerate() {
    if (!regenerationTarget) return;
    const image = regenerationTarget;
    setRegeneratingId(image._id);
    try {
      const nextJobId = await createJob({
        productIds: [image.productId],
        selectedImageTypes: [image.imageType],
        forceRegenerate: true,
        regenerationInstructions: regenerationInstructions.trim() || undefined
      });
      await reviewImages({ imageIds: [image._id], reviewStatus: "rejected" });
      setRegenerationTarget(null);
      setRegenerationInstructions("");
      toast.success(`${image.imageType} regeneration started`, {
        action: { label: "View job", onClick: () => void navigate({ to: "/jobs/$jobId", params: { jobId: nextJobId } }) }
      });
    } catch (error) {
      toast.error("Regeneration failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setRegeneratingId(null);
    }
  }

  function movePreview(delta: number) {
    if (!previewImages.length || previewIndex < 0) return;
    const next = (previewIndex + delta + previewImages.length) % previewImages.length;
    setPreviewId(previewImages[next]._id);
  }

  async function pushApproved() {
    const grouped = new Map<Id<"products">, Id<"generatedImages">[]>();
    for (const image of pushableImages) {
      grouped.set(image.productId, [...(grouped.get(image.productId) ?? []), image._id]);
    }
    if (!grouped.size) return;
    setPushing(true);
    setPushedProducts(0);
    const errors: string[] = [];
    for (const [productId, imageIds] of grouped) {
      try {
        await pushImages({ productId, imageIds, replaceExisting });
      } catch (error) {
        const product = products.find((item) => item._id === productId);
        errors.push(`${product?.title ?? productId}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setPushedProducts((count) => count + 1);
      }
    }
    setPushing(false);
    if (errors.length) {
      toast.error(`${errors.length} product push${errors.length === 1 ? "" : "es"} failed`, {
        description: errors.join(" | ")
      });
    } else {
      setPushOpen(false);
      toast.success(`${pushableImages.length} approved image${pushableImages.length === 1 ? "" : "s"} pushed to Shopify`);
    }
  }

  return (
    <main className="page">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3 text-muted-foreground" asChild>
        <Link to="/jobs">
          <ArrowLeft data-icon="inline-start" />
          Jobs
        </Link>
      </Button>
      <PageHeader
        eyebrow={job.mode}
        title={`Job ${job._id.slice(-6)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={job.executionMode === "batch" ? "success" : "neutral"}>{executionModeLabel(job.executionMode)}</StateBadge>
            <StateBadge>{job.imageProvider === "gemini" ? "Nano Banana Pro" : "OpenAI"}</StateBadge>
            <StateBadge state={jobState}>{job.status}</StateBadge>
            {job.batchStatus ? <StateBadge>{job.batchStatus}</StateBadge> : null}
            <StateBadge state={reviewBadge.tone}>{reviewBadge.label}</StateBadge>
            {job.status === "running" && job.batchId ? (
              <Button size="sm" variant="outline" onClick={handleForcePoll} disabled={polling}>
                {polling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Zap data-icon="inline-start" />}
                Force poll
              </Button>
            ) : null}
            {canCancelJob ? (
              <Button size="sm" variant="outline" onClick={handleCancelJob} disabled={cancelling}>
                {cancelling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <X data-icon="inline-start" />}
                Cancel
              </Button>
            ) : null}
            {job.status === "failed" || job.status === "cancelled" ? (
              <Button size="sm" variant="outline" onClick={() => retryJob({ jobId: job._id })}>
                <RefreshCw data-icon="inline-start" />
                Retry
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="mb-5 rounded-lg">
        <CardContent className="pt-1">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
            <span>{pct}% complete</span>
            <span className="text-muted-foreground">
              {job.completedTasks} done / {job.failedTasks} failed / {job.totalTasks} total · {formatUsd(jobCost)} · {executionModeRateLabel(job.executionMode)}
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

      <section className="mb-4">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{executionModeLabel(job.executionMode)} review</p>
            <h2 className="text-xl font-semibold">Review generated images</h2>
            <p className="mt-1 text-sm text-muted-foreground">Approve the images you want to publish. Rejected images stay available for reference.</p>
          </div>
          <Button
            variant="outline"
            disabled={!visibleReviewable.length || reviewing}
            onClick={() => void setReview(visibleReviewable.map((image) => image._id), "approved")}
          >
            <Check data-icon="inline-start" />
            Approve visible
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviewFilters.map((item) => {
            const count =
              item.value === "all"
                ? images.length
                : item.value === "pending"
                  ? pendingCount
                  : item.value === "approved"
                    ? approvedCount
                    : item.value === "rejected"
                      ? rejectedCount
                      : item.value === "failed"
                        ? failedCount
                        : pushedCount;
            return (
              <Button
                key={item.value}
                variant={filter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(item.value)}
              >
                {item.label} {count}
              </Button>
            );
          })}
        </div>
      </section>

      {productRows.length ? (
        <section className="grid gap-4">
          {productRows.map(({ product, images: rowImages }) => (
            <ProductReviewCard
              key={product._id}
              product={product}
              shopifyAdminUrl={getShopifyAdminUrl(product, shopInfo?.storeHandle)}
              images={rowImages}
              reviewing={reviewing}
              regeneratingId={regeneratingId}
              onPreview={setPreviewId}
              onReview={(imageIds, reviewStatus) => void setReview(imageIds, reviewStatus)}
              onRegenerate={openRegeneration}
            />
          ))}
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
          <Card size="sm" className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-md">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {approvedCount} approved · {pendingCount} to review · {rejectedCount} rejected
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {pushableImages.length ? `${pushableImages.length} approved image${pushableImages.length === 1 ? "" : "s"} ready to push` : "No newly approved images to push"}
              </p>
            </div>
            <Button disabled={!pushableImages.length} onClick={() => setPushOpen(true)}>
              <Send data-icon="inline-start" />
              Push {pushableImages.length || ""}
            </Button>
          </Card>
        </div>
      ) : null}

      <PreviewDialog
        image={previewImage}
        index={previewIndex}
        total={previewImages.length}
        reviewing={reviewing}
        regenerating={previewImage?._id === regeneratingId}
        onClose={() => setPreviewId(null)}
        onMove={movePreview}
        onReview={(reviewStatus) => previewImage && void setReview([previewImage._id], reviewStatus)}
        onRegenerate={() => previewImage && openRegeneration(previewImage)}
      />

      <RegenerateDialog
        image={regenerationTarget}
        instructions={regenerationInstructions}
        regenerating={regenerationTarget?._id === regeneratingId}
        onInstructionsChange={setRegenerationInstructions}
        onClose={() => {
          if (!regeneratingId) setRegenerationTarget(null);
        }}
        onRegenerate={() => void regenerate()}
      />

      <AlertDialog open={pushOpen} onOpenChange={(open) => !pushing && setPushOpen(open)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Push approved images to Shopify?</AlertDialogTitle>
            <AlertDialogDescription>
              This will upload {pushableImages.length} approved image{pushableImages.length === 1 ? "" : "s"} across {pushProductCount} product
              {pushProductCount === 1 ? "" : "s"}. Rejected and unreviewed images will stay untouched.
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
                <span>{pushedProducts} / {pushProductCount}</span>
              </div>
              <Progress value={pushProductCount ? (pushedProducts / pushProductCount) * 100 : 0} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pushing}>Cancel</AlertDialogCancel>
            <Button disabled={pushing || !pushableImages.length} onClick={() => void pushApproved()}>
              <BusyIcon busy={pushing} />
              {!pushing ? <Send data-icon="inline-start" /> : null}
              Push {pushableImages.length} image{pushableImages.length === 1 ? "" : "s"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function RegenerateDialog({
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

function ProductReviewCard({
  product,
  shopifyAdminUrl,
  images,
  reviewing,
  regeneratingId,
  onPreview,
  onReview,
  onRegenerate
}: {
  product: Doc<"products">;
  shopifyAdminUrl: string | null;
  images: Doc<"generatedImages">[];
  reviewing: boolean;
  regeneratingId: Id<"generatedImages"> | null;
  onPreview: (imageId: Id<"generatedImages">) => void;
  onReview: (imageIds: Id<"generatedImages">[], reviewStatus: "approved" | "rejected") => void;
  onRegenerate: (image: Doc<"generatedImages">) => void;
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {images.map((image) => (
            <ReviewTile
              key={image._id}
              image={image}
              reviewing={reviewing}
              regenerating={regeneratingId === image._id}
              onPreview={() => onPreview(image._id)}
              onReview={(reviewStatus) => onReview([image._id], reviewStatus)}
              onRegenerate={() => onRegenerate(image)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewTile({
  image,
  reviewing,
  regenerating,
  onPreview,
  onReview,
  onRegenerate
}: {
  image: Doc<"generatedImages">;
  reviewing: boolean;
  regenerating: boolean;
  onPreview: () => void;
  onReview: (reviewStatus: "approved" | "rejected") => void;
  onRegenerate: () => void;
}) {
  const reviewable = isReviewable(image);
  return (
    <article className="overflow-hidden rounded-lg border bg-background">
      <button
        type="button"
        className="image-tile group relative block w-full cursor-zoom-in rounded-none"
        disabled={!image.storageUrl}
        onClick={onPreview}
      >
        {image.storageUrl ? (
          <>
            <img src={image.storageUrl} alt={image.imageType} />
            <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
              <Eye className="size-3.5" />
            </span>
          </>
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">{image.status}</span>
        )}
      </button>
      <div className="grid gap-2 p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{image.imageType}</p>
          <ImageStateBadge image={image} />
        </div>
        {image.error ? <p className="line-clamp-2 text-xs text-destructive">{image.error}</p> : null}
        {reviewable ? (
          <div className="grid grid-cols-3 gap-1">
            <Button
              aria-label={`Approve ${image.imageType}`}
              title="Approve"
              variant={getReviewStatus(image) === "approved" ? "default" : "outline"}
              size="icon-sm"
              disabled={reviewing}
              onClick={() => onReview("approved")}
            >
              <Check />
            </Button>
            <Button
              aria-label={`Reject ${image.imageType}`}
              title="Reject"
              variant={getReviewStatus(image) === "rejected" ? "destructive" : "outline"}
              size="icon-sm"
              disabled={reviewing}
              onClick={() => onReview("rejected")}
            >
              <X />
            </Button>
            <Button
              aria-label={`Regenerate ${image.imageType}`}
              title="Regenerate"
              variant="outline"
              size="icon-sm"
              disabled={regenerating}
              onClick={onRegenerate}
            >
              {regenerating ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ImageStateBadge({ image }: { image: Doc<"generatedImages"> }) {
  if (image.status === "failed") return <StateBadge state="danger">Error</StateBadge>;
  if (image.status === "canceled") return <StateBadge state="danger">Canceled</StateBadge>;
  if (image.status === "uploaded") return <StateBadge state="success">Pushed</StateBadge>;
  if (!isReviewable(image)) return <StateBadge state="warning">{image.status}</StateBadge>;
  const reviewStatus = getReviewStatus(image);
  if (reviewStatus === "approved") return <StateBadge state="success">Approved</StateBadge>;
  if (reviewStatus === "rejected") return <StateBadge state="danger">Rejected</StateBadge>;
  return <StateBadge state="warning">To review</StateBadge>;
}

function PreviewDialog({
  image,
  index,
  total,
  reviewing,
  regenerating,
  onClose,
  onMove,
  onReview,
  onRegenerate
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
