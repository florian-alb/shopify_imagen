import { Send } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Doc } from "@/lib/convex";

export function JobPublishApprovedDialog({
  open,
  starting,
  publishDisabled,
  replaceExisting,
  selectedPushableImages,
  selectedPushProductCount,
  targetProduct,
  destination,
  onOpenChange,
  onPush,
  onReplaceExistingChange,
}: {
  open: boolean;
  starting: boolean;
  publishDisabled: boolean;
  replaceExisting: boolean;
  selectedPushableImages: Doc<"generatedImages">[];
  selectedPushProductCount: number;
  targetProduct: Doc<"products"> | null;
  destination: string;
  onOpenChange: (open: boolean) => void;
  onPush: () => void;
  onReplaceExistingChange: (checked: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {targetProduct
              ? "Publier les images de ce produit ?"
              : "Publier les images approuvées du lot ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {selectedPushableImages.length} image{selectedPushableImages.length === 1 ? "" : "s"}{" "}
            approuvée{selectedPushableImages.length === 1 ? "" : "s"} pour{" "}
            {targetProduct
              ? targetProduct.title
              : `${selectedPushProductCount} produit${selectedPushProductCount === 1 ? "" : "s"}`}
            . Les images non vérifiées, rejetées ou déjà publiées ne sont pas incluses.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Destination : </span>
            <strong>{destination}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            {targetProduct
              ? "Ce produit uniquement."
              : "Toutes les images admissibles du lot, quel que soit le filtre de vérification affiché."}
          </p>
        </div>
        <Label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            className="mt-0.5"
            checked={replaceExisting}
            disabled={publishDisabled}
            onCheckedChange={(checked) => onReplaceExistingChange(checked === true)}
          />
          <span>
            <strong className="block text-sm">Remplacer les galeries Shopify</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Les anciens médias Shopify seront supprimés après chaque envoi réussi.
            </span>
          </span>
        </Label>
        <p className="text-xs text-muted-foreground">
          La publication continue en arrière-plan. Retrouvez sa progression sur ce lot, même après
          avoir quitté la page.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={starting}>Annuler</AlertDialogCancel>
          <Button disabled={publishDisabled || !selectedPushableImages.length} onClick={onPush}>
            <BusyIcon busy={starting} />
            {!starting && <Send />}Publier {selectedPushableImages.length} image
            {selectedPushableImages.length === 1 ? "" : "s"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
