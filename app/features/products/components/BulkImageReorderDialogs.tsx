import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { useBulkImageReorder } from "../hooks/useBulkImageReorder";
import { BulkImageReorderDialog } from "./BulkImageReorderDialog";

export type BulkImageReorderController = ReturnType<
  typeof useBulkImageReorder
>;

export function BulkImageReorderDialogs({
  bulkReorder,
}: {
  bulkReorder: BulkImageReorderController;
}) {
  const confirmationCopy =
    bulkReorder.confirmation === "cancel"
      ? {
          title: "Abandonner la réorganisation ?",
          description:
            "Les produits déjà traités restent réorganisés. Les produits encore en attente ne seront pas modifiés.",
          label: "Abandonner",
        }
      : bulkReorder.confirmation === "restore"
        ? {
            title: "Restaurer l’ordre original ?",
            description:
              "Chaque galerie sera restaurée uniquement si son ordre correspond encore au résultat de ce bulk. Les changements plus récents seront conservés comme conflits.",
            label: "Restaurer",
          }
        : {
            title: "Archiver ce résultat ?",
            description:
              "L’opération disparaîtra du suivi actif mais restera visible dans l’historique des bulks.",
            label: "Archiver",
          };

  function confirm() {
    if (bulkReorder.confirmation === "cancel") void bulkReorder.cancel();
    else if (bulkReorder.confirmation === "restore") void bulkReorder.restore();
    else if (bulkReorder.confirmation === "dismiss") void bulkReorder.dismiss();
  }

  return (
    <>
      <BulkImageReorderDialog
        open={bulkReorder.open}
        isNewFlow={bulkReorder.isNewFlow}
        selectedProductCount={bulkReorder.selectedProductCount}
        selectionOptions={bulkReorder.selectionOptions}
        selectionOptionsLoading={bulkReorder.selectionOptionsLoading}
        firstPosition={bulkReorder.firstPosition}
        secondPosition={bulkReorder.secondPosition}
        eligibleProductCount={bulkReorder.eligibleProductCount}
        details={bulkReorder.details}
        starting={bulkReorder.starting}
        retrying={bulkReorder.retrying}
        busy={bulkReorder.busy}
        commandError={bulkReorder.commandError}
        onOpenChange={bulkReorder.onOpenChange}
        onCloseAutoFocus={bulkReorder.onCloseAutoFocus}
        onFirstPositionChange={bulkReorder.setFirstPosition}
        onSecondPositionChange={bulkReorder.setSecondPosition}
        onStart={() => void bulkReorder.start()}
        onRetry={() => void bulkReorder.retry()}
        onClose={bulkReorder.close}
        onRequestCancel={() => bulkReorder.requestConfirmation("cancel")}
        onRequestRestore={() => bulkReorder.requestConfirmation("restore")}
        onRequestDismiss={() => bulkReorder.requestConfirmation("dismiss")}
      />
      <AlertDialog
        open={bulkReorder.confirmation !== null}
        onOpenChange={bulkReorder.onConfirmationChange}
      >
        <AlertDialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReorder.busy}>
              Retour
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                bulkReorder.confirmation === "cancel"
                  ? "destructive"
                  : "default"
              }
              disabled={bulkReorder.busy}
              onClick={confirm}
            >
              {confirmationCopy.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
