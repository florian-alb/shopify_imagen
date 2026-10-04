import { imageTargetKey, type GenerationTarget } from "../generationTargets";

export type PublicationImage = {
  productId: string;
  imageType: string;
  visualGroupId?: string | null;
  visualGroupLabel?: string | null;
  generationTarget?: GenerationTarget;
};

export function publicationTargets<T extends PublicationImage>(
  images: readonly T[],
) {
  const targets = new Map<
    string,
    {
      key: string;
      label: string;
      variantId: string | null;
      groupId: string | null;
      assignAllVariants: boolean;
      requiresVariantImage: boolean;
      images: T[];
    }
  >();
  for (const image of images) {
    const key = imageTargetKey(image);
    let target = targets.get(key);
    if (!target) {
      const variantId =
        image.generationTarget?.kind === "variant"
          ? image.generationTarget.shopifyVariantId
          : null;
      const groupId = image.visualGroupId ?? null;
      const assignAllVariants =
        image.generationTarget?.assignAllVariants === true;
      target = {
        key,
        label:
          image.generationTarget?.variantTitle ||
          image.visualGroupLabel ||
          "Produit",
        variantId,
        groupId,
        assignAllVariants,
        requiresVariantImage: Boolean(
          variantId || groupId || assignAllVariants,
        ),
        images: [],
      };
      targets.set(key, target);
    }
    target.images.push(image);
  }
  return Array.from(targets.values());
}

export function validatePublicationTargets<T extends PublicationImage>(
  images: readonly T[],
  promptOneType: string | null,
  replaceVariantMedia: boolean,
) {
  const targets = publicationTargets(images);
  if (!replaceVariantMedia) return targets;
  for (const target of targets) {
    if (!target.requiresVariantImage) continue;
    if (!promptOneType)
      throw new Error(
        "Configurez un prompt en position n° 1 avant de remplacer les images des variantes.",
      );
    const primary = target.images.filter(
      (image) => image.imageType === promptOneType,
    );
    if (!primary.length)
      throw new Error(
        `Sélectionnez et approuvez l’image du prompt n° 1 pour « ${target.label} ».`,
      );
    if (primary.length > 1)
      throw new Error(
        `Sélectionnez une seule image du prompt n° 1 pour « ${target.label} ».`,
      );
  }
  return targets;
}

export function publicationVariantIds(
  target: {
    variantId: string | null;
    assignAllVariants: boolean;
    label: string;
  },
  currentVariantIds: string[],
  groupVariantIds: string[] = [],
) {
  const ids = target.variantId
    ? [target.variantId]
    : target.assignAllVariants
      ? currentVariantIds
      : groupVariantIds;
  if (ids.some((id) => !currentVariantIds.includes(id))) {
    throw new Error(
      `Une variante de « ${target.label} » n’existe plus. Synchronisez le produit avant publication.`,
    );
  }
  return Array.from(new Set(ids));
}
