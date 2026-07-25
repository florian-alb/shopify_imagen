import type { Dispatch, SetStateAction } from "react";
import { ImageIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/lib/convex";
import { PublishImagesOptions } from "./PublishImagesOptions";
import type { VisualGroupsData, VisualGroupWithRows } from "../types";

type PublishProductGroup = {
  key: string;
  label: string;
  images: Doc<"generatedImages">[];
  group: VisualGroupWithRows | null;
  member: Doc<"visualProductFamilyMembers"> | null;
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
  visualGroupsData,
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
  publishMode: "variant_media" | "separate_products" | null;
  visualGroupsData: VisualGroupsData | null | undefined;
  focusedGroupId?: Id<"visualGroups"> | null;
  busy: boolean;
  onPush: () => void;
}) {
  const separateProducts = publishMode === "separate_products";
  const hasVisualGroups = publishMode !== null;
  const productGroups = buildPublishProductGroups(
    readyImages,
    visualGroupsData,
    focusedGroupId,
  );
  const focusedProductGroup = focusedGroupId ? productGroups[0] : null;
  const selectedProductCount = productGroups.filter((productGroup) =>
    productGroup.images.some((image) => selectedPushIds.has(image._id)),
  ).length;

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
              : separateProducts
                ? "Publier les déclinaisons sur Shopify ?"
                : "Publier les images sur Shopify ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {focusedProductGroup
              ? "Les images et les variantes Shopify de cette déclinaison uniquement seront mises à jour."
              : separateProducts
                ? "Chaque bloc deviendra un produit enfant. Sa première image sélectionnée sera l’image de ses variantes Shopify."
                : publishMode === "variant_media"
                  ? "Chaque bloc correspond à une déclinaison du produit mère. La première image sélectionnée sera assignée à ses variantes."
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
                  L’ordre des images détermine l’image principale.
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
                  onToggleImage={toggleImage}
                />
              ))}
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
            {separateProducts
              ? `Publier ${selectedProductCount} produit${selectedProductCount === 1 ? "" : "s"}`
              : `Publier ${selectedPushIds.size} image${selectedPushIds.size === 1 ? "" : "s"}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PublishProductBlock({
  productGroup,
  selectedPushIds,
  onToggleImage,
}: {
  productGroup: PublishProductGroup;
  selectedPushIds: Set<Id<"generatedImages">>;
  onToggleImage: (imageId: Id<"generatedImages">, checked: boolean) => void;
}) {
  const selectedImages = productGroup.images.filter((image) =>
    selectedPushIds.has(image._id),
  );
  const primaryImage = selectedImages[0];
  const secondaryImages = productGroup.images.filter(
    (image) => image._id !== primaryImage?._id,
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          {productGroup.group ? (
            <span
              className="size-5 shrink-0 rounded-full border"
              style={{
                background: productGroup.group.swatchCss ?? "var(--muted)",
              }}
              aria-hidden="true"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {productGroup.member?.title ?? productGroup.label}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {productGroup.group
                ? `${productGroup.group.variants.length} variante${productGroup.group.variants.length === 1 ? "" : "s"} Shopify`
                : "Galerie produit"}
            </p>
          </div>
        </div>
        <Badge
          variant={productGroup.member ? "secondary" : "outline"}
          className="w-fit"
        >
          {productGroup.member ? "Produit Shopify créé" : "Produit enfant"}
        </Badge>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
        {primaryImage ? (
          <Label className="group relative block cursor-pointer overflow-hidden rounded-lg border bg-muted has-[:checked]:border-primary">
            <span className="block aspect-[4/5]">
              <img
                src={primaryImage.storageUrl!}
                alt={`Image principale ${productGroup.label}`}
                className="size-full object-cover"
              />
            </span>
            <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-background/90">
              <Checkbox
                checked
                onCheckedChange={(checked) =>
                  onToggleImage(primaryImage._id, checked === true)
                }
                aria-label={`Désélectionner l’image principale de ${productGroup.label}`}
              />
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-1.5 text-center text-[11px] font-medium">
              Image principale
            </span>
          </Label>
        ) : (
          <div className="grid aspect-[4/5] place-items-center rounded-lg border bg-muted text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}

        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Images de la galerie
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {secondaryImages.map((image) => (
              <Label
                key={image._id}
                className="flex min-w-0 items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary"
              >
                <Checkbox
                  checked={selectedPushIds.has(image._id)}
                  onCheckedChange={(checked) =>
                    onToggleImage(image._id, checked === true)
                  }
                />
                <span className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  <img
                    src={image.storageUrl!}
                    alt={image.imageType}
                    className="size-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {image.imageType}
                </span>
                <ImageStateBadge image={image} />
              </Label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildPublishProductGroups(
  images: Doc<"generatedImages">[],
  visualGroupsData: VisualGroupsData | null | undefined,
  focusedGroupId: Id<"visualGroups"> | null | undefined,
): PublishProductGroup[] {
  if (!visualGroupsData?.config) {
    return [
      {
        key: "all",
        label: "Images approuvées",
        images,
        group: null,
        member: null,
      },
    ];
  }

  const memberByGroupId = new Map(
    (visualGroupsData.family?.members ?? []).map((member) => [
      member.groupId,
      member,
    ]),
  );
  const visibleGroups = focusedGroupId
    ? visualGroupsData.groups.filter((group) => group._id === focusedGroupId)
    : visualGroupsData.groups;
  const groups: PublishProductGroup[] = visibleGroups
    .map((group) => ({
      key: group._id,
      label: group.label,
      images: images.filter((image) => image.visualGroupId === group._id),
      group,
      member: memberByGroupId.get(group._id) ?? null,
    }))
    .filter((group) => group.images.length);
  const assignedGroupIds = new Set(groups.map((group) => group.key));
  const unassignedImages = focusedGroupId
    ? []
    : images.filter(
        (image) =>
          !image.visualGroupId || !assignedGroupIds.has(image.visualGroupId),
      );

  if (unassignedImages.length) {
    groups.push({
      key: "unassigned",
      label: "Sans déclinaison",
      images: unassignedImages,
      group: null,
      member: null,
    });
  }

  return groups;
}
