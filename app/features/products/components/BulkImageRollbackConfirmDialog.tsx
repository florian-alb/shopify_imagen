import { Undo2 } from "lucide-react";

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

export function BulkImageRollbackConfirmDialog({
  open,
  imageCount,
  rollingBack,
  commandError,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  imageCount: number;
  rollingBack: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-amber-500/10 text-amber-700 sm:mx-0 dark:text-amber-400">
            <Undo2 className="size-5" />
          </span>
          <AlertDialogTitle>
            Restaurer {imageCount} image{imageCount === 1 ? "" : "s"} ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Les fichiers originaux sauvegardés avant ce bulk seront republiés
            sur Shopify. Les images modifiées depuis ne seront pas écrasées et
            seront signalées comme conflits. La restauration peut prendre
            plusieurs minutes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {commandError ? (
          <Alert variant="destructive">
            <Undo2 />
            <AlertTitle>Restauration impossible</AlertTitle>
            <AlertDescription>{commandError}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={rollingBack}>Annuler</AlertDialogCancel>
          <Button
            type="button"
            disabled={rollingBack || imageCount <= 0}
            onClick={onConfirm}
          >
            <BusyIcon busy={rollingBack} />
            {!rollingBack ? <Undo2 data-icon="inline-start" /> : null}
            {rollingBack ? "Restauration en cours…" : "Restaurer les images"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
