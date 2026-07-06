import { useAction, useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useGeneratedImageRetouch } from "@/features/images/hooks/useGeneratedImageRetouch";
import { reviewAggregateBadge } from "@/features/images/lib/review";
import { api, type Doc, type Id } from "@/lib/convex";
import {
  createJobDetailViewModel,
  type ReviewFilter,
} from "../lib/jobDetailViewModel";
import { useJobDetail } from "./useJobDetail";
import { useJobImagePublish } from "./useJobImagePublish";
import { useJobImageRegeneration } from "./useJobImageRegeneration";
import { useJobImageReview } from "./useJobImageReview";

const emptyImages: Doc<"generatedImages">[] = [];
const emptyProducts: Doc<"products">[] = [];

export function useJobDetailPage(jobId: string) {
  const { data, shopInfo } = useJobDetail(jobId);
  const retryJob = useMutation(api.jobs.retry);
  const pollJob = useAction(api.generation.pollJob);
  const cancelJob = useAction(api.generation.cancelJob);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [previewId, setPreviewId] = useState<Id<"generatedImages"> | null>(
    null,
  );
  const [pushTargetProductId, setPushTargetProductId] =
    useState<Id<"products"> | null>(null);
  const review = useJobImageReview();
  const regeneration = useJobImageRegeneration({
    onOpen: () => setPreviewId(null),
  });
  const publish = useJobImagePublish();
  const retouch = useGeneratedImageRetouch({
    onSaved: (retouchedImageId) => setPreviewId(retouchedImageId),
  });

  const job = data?.job ?? null;
  const images = data?.images ?? emptyImages;
  const products = data?.products ?? emptyProducts;

  const viewModel = useMemo(
    () =>
      job
        ? createJobDetailViewModel({
            filter,
            images,
            job,
            products,
            pushTargetProductId,
            storeHandle: shopInfo?.storeHandle,
          })
        : null,
    [filter, images, job, products, pushTargetProductId, shopInfo?.storeHandle],
  );

  const previewImage =
    viewModel?.previewImages.find((image) => image._id === previewId) ?? null;
  const previewIndex = previewImage
    ? (viewModel?.previewImages.findIndex(
        (image) => image._id === previewImage._id,
      ) ?? -1)
    : -1;
  const pushTargetProduct = pushTargetProductId
    ? products.find((product) => product._id === pushTargetProductId) ?? null
    : null;
  const reviewBadge = viewModel
    ? reviewAggregateBadge({
        total: viewModel.reviewableImages.length,
        pending: viewModel.pendingCount,
        approved: viewModel.approvedImages.length,
        rejected: viewModel.rejectedCount,
      })
    : reviewAggregateBadge({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      });

  async function forcePoll() {
    if (!job) return;
    setPolling(true);
    try {
      const result = await pollJob({ jobId: job._id });
      if (result.state === "pending") {
        toast.info(
          `Batch still processing${
            result.batchStatus ? ` (${result.batchStatus})` : ""
          }. No results yet.`,
        );
      } else if (result.state === "busy") {
        toast.info("Batch results already ingested.");
      } else if (result.state === "failed") {
        toast.error(`Batch failed: ${result.error}`);
      } else if (result.state === "cancelled") {
        toast.info("Batch cancelled.");
      } else if (result.state === "partial") {
        toast.success(
          `Progress: ${result.ingested} image(s) ingested, ${result.failed} failed. next chunk will continue automatically.`,
        );
      } else {
        toast.success(
          `Done: ${result.ingested} image(s) ingested, ${result.failed} failed.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPolling(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    try {
      const result = await cancelJob({ jobId: job._id });
      toast.info(
        `Job cancelled${result.batchStatus ? ` (${result.batchStatus})` : ""}.`,
      );
    } catch (error) {
      toast.error("Cancel failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCancelling(false);
    }
  }

  async function retry() {
    if (!job) return;
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

  function movePreview(delta: number) {
    if (!viewModel?.previewImages.length || previewIndex < 0) return;
    const next =
      (previewIndex + delta + viewModel.previewImages.length) %
      viewModel.previewImages.length;
    setPreviewId(viewModel.previewImages[next]._id);
  }

  function openProductPublish(productId: Id<"products">) {
    setPushTargetProductId(productId);
    publish.setPushOpen(true);
  }

  function openGlobalPublish() {
    setPushTargetProductId(null);
    publish.setPushOpen(true);
  }

  function onPublishOpenChange(open: boolean) {
    if (publish.pushing) return;
    publish.setPushOpen(open);
    if (!open) setPushTargetProductId(null);
  }

  async function pushApproved() {
    if (!viewModel) return;
    const success = await publish.pushApproved({
      products,
      pushableImages: viewModel.selectedPushableImages,
      successMessage: pushTargetProduct
        ? `${viewModel.selectedPushableImages.length} image${
            viewModel.selectedPushableImages.length === 1 ? "" : "s"
          } pushed for ${pushTargetProduct.title}`
        : undefined,
    });

    if (success) setPushTargetProductId(null);
  }

  function reviewVisible() {
    if (!viewModel) return;
    void review.setReview(
      viewModel.visibleReviewable.map((image) => image._id),
      "approved",
    );
  }

  function reviewPreview(reviewStatus: "approved" | "rejected") {
    if (!previewImage) return;
    void review.setReview([previewImage._id], reviewStatus);
  }

  function regeneratePreview() {
    if (previewImage) regeneration.openRegeneration(previewImage);
  }

  function retouchPreview() {
    if (previewImage) retouch.openRetouch(previewImage);
  }

  function retryImage(image: Doc<"generatedImages">) {
    void regeneration.retryImage(image);
  }

  return {
    cancelling,
    data,
    filter,
    images,
    job,
    polling,
    previewImage,
    previewIndex,
    products,
    publish,
    pushTargetProduct,
    pushTargetProductId,
    regeneration,
    retouch,
    retrying,
    review,
    reviewBadge,
    setFilter,
    setPreviewId,
    viewModel,
    actions: {
      cancel,
      forcePoll,
      movePreview,
      onPublishOpenChange,
      openGlobalPublish,
      openProductPublish,
      pushApproved,
      regeneratePreview,
      retry,
      retryImage,
      retouchPreview,
      reviewPreview,
      reviewVisible,
    },
  };
}
