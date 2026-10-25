import { Trash2 } from "lucide-react";

import { BusyIcon } from "@/components/page";
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
import type { Doc } from "@/lib/convex";

export function DeleteImageDialog({
  target,
  busy,
  onOpenChange,
  onConfirm,
}: {
  target: Doc<"generatedImages"> | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette image partout ?</AlertDialogTitle>
          <AlertDialogDescription>
            L’image <strong>{target?.imageType}</strong> sera supprimée du stockage,
            de Shopify si elle a été publiée et de l’historique du produit.
            Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            <BusyIcon busy={busy} />
            {!busy ? <Trash2 data-icon="inline-start" /> : null}
            Supprimer partout
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
