import type { Dispatch, SetStateAction } from "react";
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
import type { Doc, Id } from "@/lib/convex";
import { PublishImagesOptions } from "./PublishImagesOptions";
import type { VisualGroupsData } from "../types";
import { buildPublishProductGroups } from "../lib/publishProductGroups";
import { PublishProductBlock } from "./PublishProductBlock";

export function PublishImagesDialog({
  open,
  onOpenChange,
  readyImages,
  selectedPushIds,
  setSelectedPushIds,
  replaceExisting,
  setReplaceExisting,
  replaceVariantMedia,
  setReplaceVariantMedia,
  hasVisualGroups,
  visualGroupsData,
  primaryVariantImageType,
  focusedGroupId,
  busy,
  onPush,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readyImages: Doc<"generatedImages">[];
  selectedPushIds: Set<Id<"generatedImages">>;
  setSelectedPushIds: Dispatch<SetStateAction<Set<Id<"generatedImages">>>>;
  replaceExisting: boolean;
  setReplaceExisting: Dispatch<SetStateAction<boolean>>;
  replaceVariantMedia: boolean;
  setReplaceVariantMedia: Dispatch<SetStateAction<boolean>>;
  hasVisualGroups: boolean;
  visualGroupsData: VisualGroupsData | null | undefined;
  primaryVariantImageType: string | null;
  focusedGroupId?: Id<"visualGroups"> | null;
  busy: boolean;
  onPush: () => void;
}) {
  const productGroups = buildPublishProductGroups(
    readyImages,
    visualGroupsData,
    focusedGroupId,
  );
  const focusedProductGroup = focusedGroupId ? productGroups[0] : null;
  const hasVariantTargets = productGroups.some(
    (group) => group.requiresVariantImage,
  );
  const selectedProductCount = productGroups.filter((productGroup) =>
    productGroup.images.some((image) => selectedPushIds.has(image._id)),
  ).length;
  const groupsMissingPromptOne =
    (replaceExisting || replaceVariantMedia) && primaryVariantImageType
      ? productGroups.filter(
          (productGroup) =>
            productGroup.requiresVariantImage &&
            productGroup.images.some((image) =>
              selectedPushIds.has(image._id),
            ) &&
            productGroup.images.filter(
              (image) =>
                image.imageType === primaryVariantImageType &&
                selectedPushIds.has(image._id),
            ).length !== 1,
        )
      : [];
  const promptOneConfigurationMissing =
    (replaceExisting || replaceVariantMedia) &&
    productGroups.some((group) => group.requiresVariantImage) &&
    !primaryVariantImageType;

  const toggleImage = (imageId: Id<"generatedImages">, checked: boolean) => {
    setSelectedPushIds((current) => {
      const next = new Set(current);
      if (checked) next.add(imageId);
      else next.delete(imageId);
      return next;
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="h-[min(46rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 data-[size=default]:max-w-none data-[size=default]:sm:max-w-2xl">
        <AlertDialogHeader className="place-items-start gap-1.5 border-b p-4 text-left">
          <AlertDialogTitle>
            {focusedProductGroup
              ? `Publier · ${focusedProductGroup.label}`
              : "Publier les images sur Shopify ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {focusedProductGroup
              ? "Les images de cette déclinaison seront publiées et son image du prompt n° 1 sera assignée à ses variantes Shopify."
              : hasVisualGroups
                ? "Chaque bloc correspond à une cible de génération. L’image du prompt n° 1 sera assignée aux variantes Shopify correspondantes."
                : "Choisissez les images approuvées à envoyer sur Shopify."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div className="grid gap-4">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {selectedProductCount} déclinaison
                  {selectedProductCount === 1 ? "" : "s"} ·{" "}
                  {selectedPushIds.size} image
                  {selectedPushIds.size === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasVariantTargets
                    ? "Le prompt n° 1 détermine l’image des variantes."
                    : "L’ordre des images détermine l’image principale."}
                </p>
              </div>
              <Label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8">
                <Checkbox
                  checked={
                    readyImages.length > 0 &&
                    selectedPushIds.size === readyImages.length
                  }
                  onCheckedChange={(checked) =>
                    setSelectedPushIds(
                      checked === true
                        ? new Set(readyImages.map((image) => image._id))
                        : new Set(),
                    )
                  }
                />
                Tout sélectionner
              </Label>
            </div>

            <div className="grid gap-3">
              {productGroups.map((productGroup) => (
                <PublishProductBlock
                  key={productGroup.key}
                  productGroup={productGroup}
                  selectedPushIds={selectedPushIds}
                  primaryVariantImageType={primaryVariantImageType}
                  onToggleImage={toggleImage}
                />
              ))}
            </div>

            {promptOneConfigurationMissing ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Configurez un prompt en position n° 1 avant de remplacer les
                images des variantes.
              </p>
            ) : groupsMissingPromptOne.length ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Sélectionnez une seule image du prompt n° 1 pour{" "}
                {groupsMissingPromptOne.length} déclinaison
                {groupsMissingPromptOne.length === 1 ? "" : "s"} avant de
                remplacer les images des variantes.
              </p>
            ) : null}

            <PublishImagesOptions
              hasVisualGroups={hasVisualGroups || hasVariantTargets}
              replaceExisting={replaceExisting}
              setReplaceExisting={setReplaceExisting}
              replaceVariantMedia={replaceVariantMedia}
              setReplaceVariantMedia={setReplaceVariantMedia}
            />
          </div>
        </div>

        <AlertDialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl">
          <AlertDialogCancel className="min-h-11 sm:min-h-9" disabled={busy}>
            Annuler
          </AlertDialogCancel>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={
              busy ||
              !selectedPushIds.size ||
              promptOneConfigurationMissing ||
              groupsMissingPromptOne.length > 0
            }
            onClick={onPush}
          >
            <BusyIcon busy={busy} />
            {`Publier ${selectedPushIds.size} image${selectedPushIds.size === 1 ? "" : "s"}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
