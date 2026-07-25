export type ShopifyVariantMedia = {
  id: string;
  mediaIds: string[];
};

export type VariantMediaMutationInput = {
  variantId: string;
  mediaIds: string[];
};

export type VariantMediaPlan = {
  detach: VariantMediaMutationInput[];
  append: VariantMediaMutationInput[];
};

export function buildVariantMediaPlan(args: {
  variants: ShopifyVariantMedia[];
  primaryMediaId: string;
  replaceExisting: boolean;
}): VariantMediaPlan {
  const detach: VariantMediaMutationInput[] = [];
  const append: VariantMediaMutationInput[] = [];
  const seenVariantIds = new Set<string>();

  for (const variant of args.variants) {
    if (seenVariantIds.has(variant.id)) continue;
    seenVariantIds.add(variant.id);

    const currentMediaIds = Array.from(
      new Set(variant.mediaIds.filter(Boolean)),
    );
    const alreadyUsesPrimary = currentMediaIds.includes(args.primaryMediaId);

    if (args.replaceExisting) {
      const mediaIdsToDetach = currentMediaIds.filter(
        (mediaId) => mediaId !== args.primaryMediaId,
      );
      if (mediaIdsToDetach.length) {
        detach.push({
          variantId: variant.id,
          mediaIds: mediaIdsToDetach,
        });
      }
      if (!alreadyUsesPrimary) {
        append.push({
          variantId: variant.id,
          mediaIds: [args.primaryMediaId],
        });
      }
      continue;
    }

    if (!currentMediaIds.length) {
      append.push({
        variantId: variant.id,
        mediaIds: [args.primaryMediaId],
      });
    }
  }

  return { detach, append };
}
