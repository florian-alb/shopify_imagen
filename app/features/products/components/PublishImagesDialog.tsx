import type { Dispatch, SetStateAction } from "react";

import { ImageStateBadge } from "@/components/common/ImageStateBadge";
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

export function PublishImagesDialog({
  open,
  onOpenChange,
  readyImages,
  selectedPushIds,
  setSelectedPushIds,
  replaceExisting,
  setReplaceExisting,
  publishMode,
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
  publishMode: "variant_media" | "separate_products" | null;
  busy: boolean;
  onPush: () => void;
}) {
  const separateProducts = publishMode === "separate_products";
  const selectedImages = readyImages.filter((image) =>
    selectedPushIds.has(image._id),
  );
  const selectedProductCount = new Set(
    selectedImages
      .map((image) => image.visualGroupId)
      .filter(Boolean)
      .map(String),
  ).size;
  const imageGroups = separateProducts
    ? Array.from(
        readyImages.reduce(
          (groups, image) => {
            const key = String(image.visualGroupId ?? "unassigned");
            const current = groups.get(key) ?? {
              key,
              label: image.visualGroupLabel ?? "Sans groupe",
              images: [] as Doc<"generatedImages">[],
            };
            current.images.push(image);
            groups.set(key, current);
            return groups;
          },
          new Map<
            string,
            {
              key: string;
              label: string;
              images: Doc<"generatedImages">[];
            }
          >(),
        ).values(),
      )
    : [
        {
          key: "all",
          label: "Images approuvées",
          images: readyImages,
        },
      ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Publier les images sur Shopify ?</AlertDialogTitle>
          <AlertDialogDescription>
            {separateProducts
              ? "Un produit brouillon sera créé pour chaque groupe visuel sélectionné. Le produit source restera inchangé et ce mode sera ensuite verrouillé."
              : publishMode === "variant_media"
                ? "Chaque image sera associée aux variantes Shopify de son groupe visuel."
                : "Choisissez les images approuvées à envoyer. Les autres images restent inchangées."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {separateProducts ? (
              <>
                {selectedProductCount} produit
                {selectedProductCount === 1 ? "" : "s"} brouillon
                {selectedProductCount === 1 ? "" : "s"} ·{" "}
                {selectedPushIds.size} image
                {selectedPushIds.size === 1 ? "" : "s"}
              </>
            ) : (
              <>
                {selectedPushIds.size} sur {readyImages.length} sélectionnée
                {selectedPushIds.size === 1 ? "" : "s"}
              </>
            )}
          </span>
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
          {imageGroups.map((group) => (
            <fieldset key={group.key}>
              <legend
                className={
                  separateProducts
                    ? "mb-1 text-xs font-medium text-muted-foreground"
                    : "sr-only"
                }
              >
                {group.label} · {group.images.length} image
                {group.images.length === 1 ? "" : "s"}
              </legend>
              <div className="grid gap-2">
                {group.images.map((image) => (
                  <Label
                    key={image._id}
                    className="flex items-center gap-3 rounded-lg border p-2 has-[:checked]:border-primary"
                  >
                    <Checkbox
                      checked={selectedPushIds.has(image._id)}
                      onCheckedChange={(checked) =>
                        setSelectedPushIds((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(image._id);
                          else next.delete(image._id);
                          return next;
                        })
                      }
                    />
                    <div className="image-tile size-12 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                      <img src={image.storageUrl!} alt={image.imageType} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {image.imageType}
                    </span>
                    <ImageStateBadge image={image} />
                  </Label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {!separateProducts ? (
          <Label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={replaceExisting}
              onCheckedChange={(checked) =>
                setReplaceExisting(checked === true)
              }
            />
            <span>Remplacer la galerie Shopify après l’envoi</span>
          </Label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            className="min-h-11 sm:min-h-9"
            disabled={busy}
          >
            Annuler
          </AlertDialogCancel>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={busy || !selectedPushIds.size}
            onClick={onPush}
          >
            <BusyIcon busy={busy} />
            {separateProducts ? (
              <>
                Créer {selectedProductCount} produit
                {selectedProductCount === 1 ? "" : "s"} ·{" "}
                {selectedPushIds.size} image
                {selectedPushIds.size === 1 ? "" : "s"}
              </>
            ) : (
              <>
                Publier {selectedPushIds.size} image
                {selectedPushIds.size === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
