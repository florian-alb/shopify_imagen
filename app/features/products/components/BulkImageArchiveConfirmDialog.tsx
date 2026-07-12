import { ArchiveX } from "lucide-react";

import { BusyIcon } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function BulkImageArchiveConfirmDialog({
  open,
  hasRetryableFailures,
  dismissing,
  commandError,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  hasRetryableFailures: boolean;
  dismissing: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
            <ArchiveX className="size-5" />
          </span>
          <AlertDialogTitle>
            {hasRetryableFailures
              ? "Ignorer les erreurs et archiver ?"
              : "Archiver ce résultat ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasRetryableFailures
              ? "Ce résultat contient encore des erreurs récupérables. L’archivage les masque et interdit toute reprise de ce bulk. Les images déjà remplacées sur Shopify restent inchangées."
              : "Ce résultat ne sera plus affiché dans le suivi courant. Les images remplacées sur Shopify restent inchangées."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {commandError ? (
          <Alert variant="destructive">
            <ArchiveX />
            <AlertTitle>Archivage impossible</AlertTitle>
            <AlertDescription>{commandError}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={dismissing}>
            Conserver le résultat
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={dismissing}
            onClick={onConfirm}
          >
            <BusyIcon busy={dismissing} />
            {!dismissing ? <ArchiveX data-icon="inline-start" /> : null}
            {hasRetryableFailures
              ? "Archiver sans reprendre"
              : "Archiver le résultat"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
