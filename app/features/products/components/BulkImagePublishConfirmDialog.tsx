import { AlertTriangle, UploadCloud } from "lucide-react";

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

export function BulkImagePublishConfirmDialog({
  open,
  imageCount,
  publishing,
  commandError,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  imageCount: number;
  publishing: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
            <AlertTriangle className="size-5" />
          </span>
          <AlertDialogTitle>Remplacer les images Shopify ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le contenu de {imageCount} fichier{imageCount === 1 ? "" : "s"}
            sera remplacé en place. Les identifiants, positions, associations et
            textes alternatifs resteront inchangés. Une image modifiée depuis
            l’aperçu sera mise en conflit et ne sera pas écrasée. Si un même
            fichier est associé à d’autres produits Shopify, son nouveau contenu
            y apparaîtra également.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {commandError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Publication impossible</AlertTitle>
            <AlertDescription>{commandError}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={publishing}>Annuler</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={publishing || imageCount === 0}
            onClick={onConfirm}
          >
            <BusyIcon busy={publishing} />
            {!publishing ? <UploadCloud data-icon="inline-start" /> : null}
            Confirmer le remplacement
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
