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
import { PublishImagesOptions } from "./PublishImagesOptions";

type ImageGroup = {
  key: string;
  label: string;
  images: Doc<"generatedImages">[];
};

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
  replaceVariantMedia: boolean;
  setReplaceVariantMedia: Dispatch<SetStateAction<boolean>>;
  publishMode: "variant_media" | "separate_products" | null;
  busy: boolean;
  onPush: () => void;
}) {
  const separateProducts = publishMode === "separate_products";
  const hasVisualGroups = publishMode !== null;
  const selectedImages = readyImages.filter((image) =>
    selectedPushIds.has(image._id),
  );
  const selectedProductCount = new Set(
    selectedImages
      .map((image) => image.visualGroupId)
      .filter(Boolean)
      .map(String),
  ).size;
  const imageGroups = buildImageGroups(readyImages, hasVisualGroups);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="h-[min(44rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 data-[size=default]:max-w-none data-[size=default]:sm:max-w-xl">
        <AlertDialogHeader className="place-items-start gap-1.5 border-b p-4 text-left">
          <AlertDialogTitle>Publier les images sur Shopify ?</AlertDialogTitle>
          <AlertDialogDescription>
            {separateProducts
              ? "Un produit brouillon sera créé pour chaque groupe sélectionné. Sa première image sera utilisée pour ses variantes."
              : publishMode === "variant_media"
                ? "La première image sélectionnée de chaque groupe sera utilisée pour ses variantes. Les autres resteront dans la galerie."
                : "Choisissez les images approuvées à envoyer. Les autres images restent inchangées."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
          <div className="grid gap-4">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              {imageGroups.map((group) => {
                const primaryImage = hasVisualGroups
                  ? group.images.find((image) => selectedPushIds.has(image._id))
                  : undefined;

                return (
                  <fieldset key={group.key}>
                    <legend
                      className={
                        hasVisualGroups
                          ? "mb-1.5 text-xs font-medium text-muted-foreground"
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
                          className="flex min-w-0 items-center gap-3 rounded-lg border p-2 has-[:checked]:border-primary"
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
                          <span className="block size-12 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border [&>img]:size-full [&>img]:object-cover">
                            <img
                              src={image.storageUrl!}
                              alt={
                                [image.visualGroupLabel, image.imageType]
                                  .filter(Boolean)
                                  .join(" · ") || "Image produit"
                              }
                            />
                          </span>
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="truncate text-sm font-medium">
                              {[image.visualGroupLabel, image.imageType]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {primaryImage?._id === image._id ? (
                              <span className="truncate text-xs font-normal text-muted-foreground">
                                Image de variante
                              </span>
                            ) : null}
                          </span>
                          <ImageStateBadge image={image} />
                        </Label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>

            <PublishImagesOptions
              hasVisualGroups={hasVisualGroups}
              separateProducts={separateProducts}
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
            disabled={busy || !selectedPushIds.size}
            onClick={onPush}
          >
            <BusyIcon busy={busy} />
            {separateProducts ? (
              <>
                Créer {selectedProductCount} produit
                {selectedProductCount === 1 ? "" : "s"} · {selectedPushIds.size}{" "}
                image
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

function buildImageGroups(
  images: Doc<"generatedImages">[],
  groupByVisualVariant: boolean,
) {
  if (!groupByVisualVariant) {
    return [
      {
        key: "all",
        label: "Images approuvées",
        images,
      },
    ];
  }

  return Array.from(
    images
      .reduce((groups, image) => {
        const key = String(image.visualGroupId ?? "unassigned");
        const current = groups.get(key) ?? {
          key,
          label: image.visualGroupLabel ?? "Sans groupe",
          images: [],
        };
        current.images.push(image);
        groups.set(key, current);
        return groups;
      }, new Map<string, ImageGroup>())
      .values(),
  );
}
