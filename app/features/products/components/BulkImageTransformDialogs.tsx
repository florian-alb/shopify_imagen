import type { useBulkImageTransform } from "../hooks/useBulkImageTransform";
import {
  bulkTransformCanRetry,
  bulkTransformRollbackCount,
  bulkTransformReadyToPublishCount,
} from "../lib/bulkImageTransformViewModel";
import { BulkImageArchiveConfirmDialog } from "./BulkImageArchiveConfirmDialog";
import { BulkImageCancelConfirmDialog } from "./BulkImageCancelConfirmDialog";
import { BulkImagePublishConfirmDialog } from "./BulkImagePublishConfirmDialog";
import { BulkImageRollbackConfirmDialog } from "./BulkImageRollbackConfirmDialog";
import { BulkImageTransformDialog } from "./BulkImageTransformDialog";

export type BulkImageTransformController = ReturnType<
  typeof useBulkImageTransform
>;

export function BulkImageTransformDialogs({
  bulkTransform,
}: {
  bulkTransform: BulkImageTransformController;
}) {
  return (
    <>
      <BulkImageTransformDialog
        open={bulkTransform.open}
        isNewFlow={bulkTransform.isNewFlow}
        selectedProductCount={bulkTransform.selectedProductCount}
        selectionOptions={bulkTransform.selectionOptions}
        selectionOptionsLoading={bulkTransform.selectionOptionsLoading}
        selectedImagePositions={bulkTransform.selectedImagePositions}
        details={bulkTransform.details}
        starting={bulkTransform.starting}
        retrying={bulkTransform.retrying}
        dismissing={bulkTransform.dismissing}
        busy={bulkTransform.busy}
        commandError={bulkTransform.commandError}
        onOpenChange={bulkTransform.onOpenChange}
        onStart={() => void bulkTransform.start()}
        onRequestCancel={bulkTransform.requestCancel}
        onRequestPublish={bulkTransform.requestPublish}
        onRequestRollback={bulkTransform.requestRollback}
        onRetry={() => void bulkTransform.retry()}
        onClose={bulkTransform.close}
        onRequestDismiss={bulkTransform.requestDismiss}
        onToggleImagePosition={bulkTransform.toggleImagePosition}
        onSelectAllImagePositions={bulkTransform.selectAllImagePositions}
        onClearImagePositions={bulkTransform.clearImagePositions}
      />
      <BulkImagePublishConfirmDialog
        open={bulkTransform.publishConfirmOpen}
        imageCount={
          bulkTransform.details
            ? bulkTransformReadyToPublishCount(bulkTransform.details.job)
            : 0
        }
        publishing={bulkTransform.publishing}
        commandError={bulkTransform.commandError}
        onOpenChange={bulkTransform.onPublishConfirmChange}
        onConfirm={() => void bulkTransform.publish()}
      />
      <BulkImageCancelConfirmDialog
        open={bulkTransform.cancelConfirmOpen}
        publishedItems={bulkTransform.details?.job.publishedItems ?? 0}
        cancelling={bulkTransform.cancelling}
        commandError={bulkTransform.commandError}
        onOpenChange={bulkTransform.onCancelConfirmChange}
        onConfirm={() => void bulkTransform.cancel()}
      />
      <BulkImageRollbackConfirmDialog
        open={bulkTransform.rollbackConfirmOpen}
        imageCount={
          bulkTransform.details
            ? bulkTransformRollbackCount(bulkTransform.details.job)
            : 0
        }
        rollingBack={bulkTransform.rollingBack}
        commandError={bulkTransform.commandError}
        onOpenChange={bulkTransform.onRollbackConfirmChange}
        onConfirm={() => void bulkTransform.rollback()}
      />
      <BulkImageArchiveConfirmDialog
        open={bulkTransform.dismissConfirmOpen}
        hasRetryableFailures={
          bulkTransform.details
            ? bulkTransformCanRetry(bulkTransform.details.job)
            : false
        }
        dismissing={bulkTransform.dismissing}
        commandError={bulkTransform.commandError}
        onOpenChange={bulkTransform.onDismissConfirmChange}
        onConfirm={() => void bulkTransform.dismiss()}
      />
    </>
  );
}
