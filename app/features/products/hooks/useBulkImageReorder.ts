import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";

import {
  bulkReorderCanCancel,
  bulkReorderCanRestore,
  bulkReorderCanRetry,
  bulkReorderEligibleCount,
  bulkReorderIsTerminal,
  MAX_BULK_REORDER_PRODUCTS,
} from "../lib/bulkImageReorderViewModel";

export type BulkReorderSelectionOptions = {
  productCount: number;
  unavailableProductCount: number;
  lockedProducts: Array<{
    productId: Id<"products">;
    productTitle: string;
    operation: "flip_horizontal" | "reorder_media";
    jobId: Id<"bulkTransformJobs"> | Id<"bulkReorderJobs">;
    status:
      | Doc<"bulkTransformJobs">["status"]
      | Doc<"bulkReorderJobs">["status"];
  }>;
  positions: Array<{
    position: number;
    productCount: number;
    unlockedProductCount: number;
    previews: Array<{
      productId: Id<"products">;
      productTitle: string;
      url: string;
    }>;
  }>;
};

export type BulkReorderDetails = {
  job: Doc<"bulkReorderJobs">;
  items: Doc<"bulkReorderItems">[];
  errorItems: Doc<"bulkReorderItems">[];
};

export type BulkReorderConfirmation = "cancel" | "restore" | "dismiss";

export function useBulkImageReorder({
  onStarted,
  selectedProductIds,
}: {
  onStarted: () => void;
  selectedProductIds: Id<"products">[];
}) {
  const startBulk = useAction(api.bulkReorders.start);
  const retryBulk = useAction(api.bulkReorders.retry);
  const restoreBulk = useAction(api.bulkReorders.restore);
  const cancelBulk = useMutation(api.bulkReorders.cancel);
  const dismissBulk = useMutation(api.bulkReorders.dismiss);
  const latest = useQuery(api.bulkReorders.latestUndismissed, {}) as
    | Doc<"bulkReorderJobs">
    | null
    | undefined;
  const [jobId, setJobId] = useState<Id<"bulkReorderJobs"> | null>(null);
  const [newFlow, setNewFlow] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] =
    useState<BulkReorderConfirmation | null>(null);
  const [firstPosition, setFirstPosition] = useState(1);
  const [secondPosition, setSecondPosition] = useState(2);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const commandLockRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const movingToConfirmationRef = useRef(false);
  const trackedJobId = jobId ?? (!newFlow ? (latest?._id ?? null) : null);
  const shouldLoadDetails = Boolean(trackedJobId && (open || confirmation));
  const details = useQuery(
    api.bulkReorders.get,
    shouldLoadDetails && trackedJobId ? { jobId: trackedJobId } : "skip",
  ) as BulkReorderDetails | null | undefined;
  const shouldLoadSelectionOptions =
    newFlow &&
    open &&
    selectedProductIds.length > 0 &&
    selectedProductIds.length <= MAX_BULK_REORDER_PRODUCTS;
  const selectionOptions = useQuery(
    api.bulkTransforms.selectionOptions,
    shouldLoadSelectionOptions ? { productIds: selectedProductIds } : "skip",
  ) as BulkReorderSelectionOptions | undefined;
  const eligibleProductCount = selectionOptions
    ? bulkReorderEligibleCount(
        selectionOptions.positions,
        firstPosition,
        secondPosition,
      )
    : 0;
  const busy = starting || retrying || cancelling || restoring || dismissing;

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
    const expandedMenuTrigger = document.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-trigger"][aria-expanded="true"]',
    );
    returnFocusRef.current =
      expandedMenuTrigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setCommandError(null);
    setFirstPosition(1);
    setSecondPosition(2);
    setNewFlow(true);
    setJobId(null);
    setOpen(true);
  }

  function openJob(nextJobId: Id<"bulkReorderJobs">) {
    if (commandLockRef.current) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setCommandError(null);
    setNewFlow(false);
    setJobId(nextJobId);
    setOpen(true);
  }

  function close() {
    if (!commandLockRef.current) setOpen(false);
  }

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    setOpen(nextOpen);
  }

  function onCloseAutoFocus(event: Event) {
    event.preventDefault();
    if (movingToConfirmationRef.current) {
      movingToConfirmationRef.current = false;
      return;
    }
    returnFocusRef.current?.focus();
  }

  async function start() {
    if (
      !selectedProductIds.length ||
      selectedProductIds.length > MAX_BULK_REORDER_PRODUCTS ||
      !selectionOptions ||
      !eligibleProductCount ||
      firstPosition === secondPosition ||
      !acquireCommand()
    ) {
      return;
    }
    setCommandError(null);
    setStarting(true);
    try {
      const createdJobId = await startBulk({
        productIds: selectedProductIds,
        operation: "reorder_media",
        firstPosition,
        secondPosition,
      });
      setNewFlow(false);
      setJobId(createdJobId);
      onStarted();
      toast.success("Réorganisation lancée", {
        description:
          "Shopify est vérifié avant et après chaque produit. Les conflits sont laissés intacts.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Réorganisation impossible", { description });
    } finally {
      setStarting(false);
      releaseCommand();
    }
  }

  async function retry() {
    const job = details?.job;
    if (!job || !bulkReorderCanRetry(job) || !acquireCommand()) return;
    setCommandError(null);
    setRetrying(true);
    try {
      await retryBulk({ jobId: job._id });
      toast.success("Reprise planifiée");
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Reprise impossible", { description });
    } finally {
      setRetrying(false);
      releaseCommand();
    }
  }

  function requestConfirmation(next: BulkReorderConfirmation) {
    const job = details?.job;
    if (!job || commandLockRef.current) return;
    if (next === "cancel" && !bulkReorderCanCancel(job)) return;
    if (next === "restore" && !bulkReorderCanRestore(job)) return;
    if (next === "dismiss" && !bulkReorderIsTerminal(job.status)) return;
    setCommandError(null);
    movingToConfirmationRef.current = true;
    setOpen(false);
    setConfirmation(next);
  }

  function onConfirmationChange(nextOpen: boolean) {
    if (!nextOpen && commandLockRef.current) return;
    if (!nextOpen) {
      setConfirmation(null);
      setOpen(true);
    }
  }

  async function cancel() {
    const job = details?.job;
    if (!job || !bulkReorderCanCancel(job) || !acquireCommand()) return;
    setCommandError(null);
    setCancelling(true);
    try {
      await cancelBulk({ jobId: job._id });
      setConfirmation(null);
      setOpen(true);
      toast.success("Annulation demandée", {
        description:
          "Les produits déjà traités restent réorganisés; aucun nouveau produit ne sera lancé.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Annulation impossible", { description });
    } finally {
      setCancelling(false);
      releaseCommand();
    }
  }

  async function restore() {
    const job = details?.job;
    if (!job || !bulkReorderCanRestore(job) || !acquireCommand()) return;
    setCommandError(null);
    setRestoring(true);
    try {
      await restoreBulk({ jobId: job._id });
      setConfirmation(null);
      setOpen(true);
      toast.success("Restauration lancée", {
        description:
          "L’ordre original sera restauré uniquement si Shopify correspond encore au résultat du bulk.",
      });
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Restauration impossible", { description });
    } finally {
      setRestoring(false);
      releaseCommand();
    }
  }

  async function dismiss() {
    const job = details?.job;
    if (!job || !bulkReorderIsTerminal(job.status) || !acquireCommand()) return;
    setCommandError(null);
    setDismissing(true);
    try {
      await dismissBulk({ jobId: job._id });
      setConfirmation(null);
      setOpen(false);
      setJobId(null);
      setNewFlow(false);
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    } catch (error) {
      const description = errorMessage(error);
      setCommandError(description);
      toast.error("Archivage impossible", { description });
    } finally {
      setDismissing(false);
      releaseCommand();
    }
  }

  return {
    busy,
    cancelling,
    commandError,
    confirmation,
    details,
    dismissing,
    eligibleProductCount,
    firstPosition,
    hasTrackedJob: Boolean(latest),
    isNewFlow: newFlow,
    open,
    restoring,
    retrying,
    secondPosition,
    selectedProductCount: selectedProductIds.length,
    selectionOptions,
    selectionOptionsLoading:
      shouldLoadSelectionOptions && selectionOptions === undefined,
    starting,
    cancel,
    close,
    dismiss,
    onConfirmationChange,
    onCloseAutoFocus,
    onOpenChange,
    openJob,
    openNew,
    requestConfirmation,
    restore,
    retry,
    setFirstPosition,
    setSecondPosition,
    start,
  };
}
