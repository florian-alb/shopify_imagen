import { Trash2 } from "lucide-react";
import { BusyIcon } from "@/components/page";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/lib/convex";

export function DeleteJobDialog({ target, busy, onOpenChange, onConfirm }: {
  target: Doc<"generationJobs"> | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce job de l'historique ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le job {target?._id.slice(-6)} sera retiré définitivement des générations
            et des archives. Ses images restent disponibles sur les produits et
            ses dépenses restent comptabilisées. Cette action ne peut pas être annulée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            <BusyIcon busy={busy} />
            {!busy ? <Trash2 data-icon="inline-start" /> : null}
            Supprimer le job
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
