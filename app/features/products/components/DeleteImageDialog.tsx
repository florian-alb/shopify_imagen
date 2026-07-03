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
          <AlertDialogTitle>Delete this image everywhere?</AlertDialogTitle>
          <AlertDialogDescription>
            The <strong>{target?.imageType}</strong> image will be removed from
            storage, from Shopify if it was pushed, and from this product's
            history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            <BusyIcon busy={busy} />
            {!busy ? <Trash2 data-icon="inline-start" /> : null}
            Delete everywhere
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
