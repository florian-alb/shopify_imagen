import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";
import {
  bulkTransformCanCancel,
  bulkTransformCanPublish,
  bulkTransformCanRollback,
  bulkTransformCanRetry,
  bulkTransformIsTerminal,
  MAX_BULK_TRANSFORM_PRODUCTS,
  resolveBulkImagePositionSelection,
  toggleBulkImagePosition,
} from "../lib/bulkImageTransformViewModel";

export type BulkTransformDetails = {
  job: Doc<"bulkTransformJobs">;
  previewItems: Array<
    Doc<"bulkTransformItems"> & {
      productTitle: string;
      referencedProductCount: number;
    }
  >;
  errorItems: Array<
    Doc<"bulkTransformItems"> & {
      productTitle: string;
      referencedProductCount: number;
    }
  >;
  productErrors: Array<
    Doc<"bulkTransformSeedFailures"> & { productTitle: string }
  >;
};

export type BulkTransformSelectionOptions = {
  productCount: number;
  unavailableProductCount: number;
  lockedProducts: Array<{
    productId: Id<"products">;
    productTitle: string;
    jobId: Id<"bulkTransformJobs">;
    status: Doc<"bulkTransformJobs">["status"];
  }>;
  snapshotToken?: string;
  positions: Array<{
    position: number;
    productCount: number;
    previews: Array<{
      productId: Id<"products">;
      productTitle: string;
      url: string;
    }>;
  }>;
};

export function useBulkImageTransform({
  onStarted,
  selectedProductIds,
}: {
  onStarted: () => void;
  selectedProductIds: Id<"products">[];
}) {
  const startBulk = useAction(api.bulkTransforms.start);
  const publishBulk = useAction(api.bulkTransforms.publish);
  const rollbackBulk = useAction(api.bulkTransforms.rollback);
  const retryFailures = useAction(api.bulkTransforms.retryFailures);
  const dismissBulk = useMutation(api.bulkTransforms.dismiss);
  const cancelBulk = useMutation(api.bulkTransforms.cancel);
  const latest = useQuery(api.bulkTransforms.latestUndismissed, {}) as
    | Doc<"bulkTransformJobs">
    | null
    | undefined;
  const [jobId, setJobId] = useState<Id<"bulkTransformJobs"> | null>(null);
  const [newFlow, setNewFlow] = useState(false);
  const [open, setOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [imagePositionSelection, setImagePositionSelection] =
    useState<Set<number> | null>(null);
  const commandLockRef = useRef(false);
  const trackedJobId = jobId ?? (!newFlow ? (latest?._id ?? null) : null);
  const shouldLoadDetails = Boolean(
    trackedJobId &&
    (open ||
      publishConfirmOpen ||
      cancelConfirmOpen ||
      rollbackConfirmOpen ||
      dismissConfirmOpen),
  );
  const details = useQuery(
    api.bulkTransforms.get,
    shouldLoadDetails && trackedJobId ? { jobId: trackedJobId } : "skip",
  ) as BulkTransformDetails | null | undefined;
  const shouldLoadSelectionOptions =
    newFlow &&
    open &&
    selectedProductIds.length > 0 &&
    selectedProductIds.length <= MAX_BULK_TRANSFORM_PRODUCTS;
  const selectionOptions = useQuery(
    api.bulkTransforms.selectionOptions,
    shouldLoadSelectionOptions ? { productIds: selectedProductIds } : "skip",
  ) as BulkTransformSelectionOptions | undefined;
  const availableImagePositions =
    selectionOptions?.positions.map((option) => option.position) ?? [];
  const availableImagePositionSet = new Set(availableImagePositions);
  const selectedImagePositions = resolveBulkImagePositionSelection(
    availableImagePositions,
    imagePositionSelection,
  );
  const busy =
    starting ||
    publishing ||
    retrying ||
    dismissing ||
    cancelling ||
    rollingBack;

  function acquireCommand() {
    if (commandLockRef.current) return false;
    commandLockRef.current = true;
    return true;
  }

  function releaseCommand() {
    commandLockRef.current = false;
  }

  function openNew() {
    if (commandLockRef.current) return;
    setCommandError(null);
    setImagePositionSelection(null);
    setNewFlow(true);
    setJobId(null);
    setOpen(true);
  }

  function openJob(nextJobId: Id<"bulkTransformJobs">) {
    if (commandLockRef.current) return;
    setCommandError(null);
    setNewFlow(false);
    setJobId(nextJobId);
    setOpen(true);
  }

  function toggleImagePosition(position: number) {
    if (!availableImagePositionSet.has(position) || commandLockRef.current) {
      return;
    }
    setImagePositionSelection((current) =>
      toggleBulkImagePosition(availableImagePositions, current, position),
    );
  }

  function selectAllImagePositions() {
    if (commandLockRef.current) return;
    setImagePositionSelection(null);
  }

  function clearImagePositions() {
    if (commandLockRef.current) return;
    setImagePositionSelection(new Set());
  }

  async function start() {
    if (
      !selectedProductIds.length ||
      selectionOptions === undefined ||
      selectionOptions.unavailableProductCount > 0 ||
      selectionOptions.lockedProducts.length > 0 ||
      !selectionOptions.snapshotToken ||
      !selectedImagePositions.length ||
      !acquireCommand()
    ) {
      return;
    }
    setCommandError(null);
    setStarting(true);
    try {
      const createdJobId = await startBulk({
        productIds: selectedProductIds,
        operation: "flip_horizontal",
        imagePositions: selectedImagePositions,
        selectionSnapshotToken: selectionOptions.snapshotToken,
      });
      setNewFlow(false);
      setJobId(createdJobId);
      onStarted();
      toast.success("Préparation bulk lancée", {
        description: "Les images miroir sont calculées sans modifier Shopify.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Impossible de lancer le bulk", {
        description,
      });
    } finally {
      setStarting(false);
      releaseCommand();
    }
  }

  async function publish() {
    const currentJob = details?.job;
    const currentJobId = currentJob?._id;
    if (!currentJobId || !bulkTransformCanPublish(currentJob)) {
      setCommandError(
        "L’état du bulk a changé. Le remplacement Shopify n’a pas été lancé.",
      );
      return;
    }
    if (!acquireCommand()) {
      return;
    }
    setCommandError(null);
    setPublishing(true);
    try {
      await publishBulk({ jobId: currentJobId });
      setPublishConfirmOpen(false);
      setOpen(true);
      toast.success("Remplacement Shopify lancé", {
        description: "Chaque fichier est vérifié avant son remplacement.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Publication bulk impossible", {
        description,
      });
    } finally {
      setPublishing(false);
      releaseCommand();
    }
  }

  async function retry() {
    const currentJob = details?.job;
    const currentJobId = currentJob?._id;
    if (!currentJobId || !bulkTransformCanRetry(currentJob)) {
      setCommandError(
        "L’état du bulk a changé. Aucune reprise n’a été planifiée.",
      );
      return;
    }
    if (!acquireCommand()) {
      return;
    }
    setCommandError(null);
    setRetrying(true);
    try {
      await retryFailures({ jobId: currentJobId });
      toast.success("Reprise planifiée");
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Reprise impossible", {
        description,
      });
    } finally {
      setRetrying(false);
      releaseCommand();
    }
  }

  function close() {
    if (commandLockRef.current) return;
    setOpen(false);
  }

  async function dismiss() {
    const job = details?.job;
    if (!job || !bulkTransformIsTerminal(job.status)) {
      setCommandError(
        "L’état du bulk a changé. Le résultat n’a pas été archivé.",
      );
      return;
    }
    if (!acquireCommand()) {
      return;
    }
    setCommandError(null);
    setDismissing(true);
    try {
      await dismissBulk({ jobId: job._id });
      setJobId(null);
      setNewFlow(false);
      setOpen(false);
      setDismissConfirmOpen(false);
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Impossible d’archiver le résultat", {
        description,
      });
    } finally {
      setDismissing(false);
      releaseCommand();
    }
  }

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setOpen(nextOpen);
  }

  function requestPublish() {
    if (
      commandLockRef.current ||
      !details?.job ||
      !bulkTransformCanPublish(details.job)
    ) {
      return;
    }
    setCommandError(null);
    setOpen(false);
    setPublishConfirmOpen(true);
  }

  function requestDismiss() {
    if (
      commandLockRef.current ||
      !details?.job ||
      !bulkTransformIsTerminal(details.job.status)
    ) {
      return;
    }
    setCommandError(null);
    setOpen(false);
    setDismissConfirmOpen(true);
  }

  function onDismissConfirmChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setDismissConfirmOpen(nextOpen);
    if (!nextOpen) setOpen(true);
  }

  function onPublishConfirmChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setPublishConfirmOpen(nextOpen);
    if (!nextOpen) setOpen(true);
  }

  function requestCancel() {
    if (
      commandLockRef.current ||
      !details?.job ||
      !bulkTransformCanCancel(details.job)
    ) {
      return;
    }
    setCommandError(null);
    setOpen(false);
    setCancelConfirmOpen(true);
  }

  function onCancelConfirmChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setCancelConfirmOpen(nextOpen);
    if (!nextOpen) setOpen(true);
  }

  async function cancel() {
    const currentJob = details?.job;
    const currentJobId = currentJob?._id;
    if (!currentJobId || !bulkTransformCanCancel(currentJob)) {
      setCommandError(
        "L’état du bulk a changé. Le traitement n’a pas été abandonné.",
      );
      return;
    }
    if (!acquireCommand()) {
      return;
    }
    setCommandError(null);
    setCancelling(true);
    try {
      await cancelBulk({ jobId: currentJobId });
      setCancelConfirmOpen(false);
      setOpen(true);
      toast.success("Bulk abandonné", {
        description: currentJob.publishedItems
          ? "Les images déjà remplacées restent en place ; la suite est arrêtée."
          : "Aucune image Shopify n’a été remplacée.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Impossible d’abandonner le bulk", {
        description,
      });
    } finally {
      setCancelling(false);
      releaseCommand();
    }
  }

  function requestRollback() {
    if (
      commandLockRef.current ||
      !details?.job ||
      !bulkTransformCanRollback(details.job)
    ) {
      return;
    }
    setCommandError(null);
    setOpen(false);
    setRollbackConfirmOpen(true);
  }

  function onRollbackConfirmChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setRollbackConfirmOpen(nextOpen);
    if (!nextOpen) setOpen(true);
  }

  async function rollback() {
    const currentJob = details?.job;
    const currentJobId = currentJob?._id;
    if (!currentJobId || !bulkTransformCanRollback(currentJob)) {
      setCommandError(
        "L’état du bulk a changé. La restauration n’a pas été lancée.",
      );
      return;
    }
    if (!acquireCommand()) return;
    setCommandError(null);
    setRollingBack(true);
    try {
      await rollbackBulk({ jobId: currentJobId });
      setRollbackConfirmOpen(false);
      setOpen(true);
      toast.success("Restauration lancée", {
        description:
          "Chaque image est vérifiée avant de republier son original exact.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Restauration impossible", { description });
    } finally {
      setRollingBack(false);
      releaseCommand();
    }
  }

  return {
    details,
    selectionOptions,
    selectionOptionsLoading:
      shouldLoadSelectionOptions && selectionOptions === undefined,
    selectedImagePositions,
    cancelling,
    cancelConfirmOpen,
    rollingBack,
    rollbackConfirmOpen,
    commandError,
    busy,
    dismissing,
    dismissConfirmOpen,
    hasTrackedJob: Boolean(latest),
    selectedProductCount: selectedProductIds.length,
    isNewFlow: newFlow,
    open,
    publishConfirmOpen,
    publishing,
    retrying,
    starting,
    cancel,
    rollback,
    close,
    dismiss,
    openJob,
    openNew,
    publish,
    retry,
    onOpenChange,
    onCancelConfirmChange,
    onRollbackConfirmChange,
    onDismissConfirmChange,
    onPublishConfirmChange,
    requestPublish,
    requestCancel,
    requestRollback,
    requestDismiss,
    toggleImagePosition,
    selectAllImagePositions,
    clearImagePositions,
    start,
  };
}
