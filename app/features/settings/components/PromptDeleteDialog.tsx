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
import { type Doc } from "@/lib/convex";

export function PromptDeleteDialog({
  busy,
  deleteTarget,
  onClose,
  onDelete,
}: {
  busy: string | null;
  deleteTarget: Doc<"promptTemplates"> | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!deleteTarget) return null;

  return (
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open && busy !== deleteTarget._id) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce prompt ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action supprime uniquement le prompt de la boutique active.
            Les autres boutiques gardent leurs propres prompts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy === deleteTarget._id}>
            Annuler
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy === deleteTarget._id}
            onClick={onDelete}
          >
            <BusyIcon busy={busy === deleteTarget._id} />
            {busy !== deleteTarget._id ? (
              <Trash2 data-icon="inline-start" />
            ) : null}
            Supprimer
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
