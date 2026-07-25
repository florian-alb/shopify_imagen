import { OctagonX } from "lucide-react";

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

export function BulkImageCancelConfirmDialog({
  open,
  publishedItems,
  cancelling,
  commandError,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  publishedItems: number;
  cancelling: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
            <OctagonX className="size-5" />
          </span>
          <AlertDialogTitle>Abandonner ce bulk ?</AlertDialogTitle>
          <AlertDialogDescription>
            {publishedItems > 0
              ? `${publishedItems} image${publishedItems === 1 ? " a déjà été remplacée" : "s ont déjà été remplacées"}. Elles ne seront pas restaurées ; seule la suite du traitement sera arrêtée.`
              : "La préparation sera arrêtée et aucune image Shopify ne sera remplacée."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {commandError ? (
          <Alert variant="destructive">
            <OctagonX />
            <AlertTitle>Abandon impossible</AlertTitle>
            <AlertDescription>{commandError}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>
            Continuer le bulk
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelling}
            onClick={onConfirm}
          >
            <BusyIcon busy={cancelling} />
            {!cancelling ? <OctagonX data-icon="inline-start" /> : null}
            Confirmer l’abandon
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
