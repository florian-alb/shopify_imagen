import { ImageIcon } from "lucide-react";
import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Id } from "@/lib/convex";
import type { PublishProductGroup } from "../lib/publishProductGroups";

export function PublishProductBlock({
  productGroup,
  selectedPushIds,
  primaryVariantImageType,
  onToggleImage,
}: {
  productGroup: PublishProductGroup;
  selectedPushIds: Set<Id<"generatedImages">>;
  primaryVariantImageType: string | null;
  onToggleImage: (imageId: Id<"generatedImages">, checked: boolean) => void;
}) {
  const selectedImages = productGroup.images.filter((image) =>
    selectedPushIds.has(image._id),
  );
  const primaryImage = productGroup.requiresVariantImage
    ? productGroup.images.find(
        (image) => image.imageType === primaryVariantImageType,
      )
    : selectedImages[0];
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
              {productGroup.key.startsWith("variant:")
                ? productGroup.label
                : (productGroup.member?.title ?? productGroup.label)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {productGroup.key.startsWith("variant:")
                ? "Une variante Shopify"
                : productGroup.group
                  ? `${productGroup.group.variants.length} variante${productGroup.group.variants.length === 1 ? "" : "s"} Shopify`
                  : "Galerie produit"}
            </p>
          </div>
        </div>
        <Badge
          variant={productGroup.member ? "secondary" : "outline"}
          className="w-fit"
        >
          {productGroup.member
            ? "Produit Shopify créé"
            : productGroup.key.startsWith("variant:")
              ? "Variante Shopify"
              : "Galerie produit"}
        </Badge>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
        {primaryImage ? (
          <Label className="group relative block cursor-pointer overflow-hidden rounded-lg border bg-muted has-[:checked]:border-primary">
            <span className="block aspect-[4/5]">
              <img
                src={primaryImage.storageUrl!}
                alt={
                  productGroup.requiresVariantImage
                    ? `Image du prompt n° 1 pour ${productGroup.label}`
                    : `Image principale ${productGroup.label}`
                }
                className="size-full object-cover"
              />
            </span>
            <span className="absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-background/90">
              <Checkbox
                checked={selectedPushIds.has(primaryImage._id)}
                onCheckedChange={(checked) =>
                  onToggleImage(primaryImage._id, checked === true)
                }
                aria-label={`Sélectionner l’image ${
                  productGroup.requiresVariantImage
                    ? "du prompt n° 1"
                    : "principale"
                } de ${productGroup.label}`}
              />
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-1.5 text-center text-[11px] font-medium">
              {productGroup.requiresVariantImage
                ? "Prompt n° 1 · Variantes"
                : "Image principale"}
            </span>
          </Label>
        ) : (
          <div className="grid aspect-[4/5] place-items-center gap-1 rounded-lg border bg-muted px-2 text-center text-xs text-muted-foreground">
            <ImageIcon className="size-5" />
            {productGroup.requiresVariantImage ? "Prompt n° 1 absent" : null}
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
