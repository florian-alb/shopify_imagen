export type ShopifyVariantMedia = {
  id: string;
  mediaIds: string[];
};

export type VariantMediaUpdateInput = {
  id: string;
  mediaId: string;
};

export type PromptOrderEntry = {
  imageType: string;
  position: number | null;
};

export function buildVariantMediaUpdates(args: {
  variants: ShopifyVariantMedia[];
  primaryMediaId: string;
  replaceExisting: boolean;
}): VariantMediaUpdateInput[] {
  const updates: VariantMediaUpdateInput[] = [];
  const seenVariantIds = new Set<string>();

  for (const variant of args.variants) {
    if (seenVariantIds.has(variant.id)) continue;
    seenVariantIds.add(variant.id);

    const currentMediaIds = Array.from(
      new Set(variant.mediaIds.filter(Boolean)),
    );
    if (!args.replaceExisting && currentMediaIds.length) continue;
    if (
      currentMediaIds.length === 1 &&
      currentMediaIds[0] === args.primaryMediaId
    )
      continue;
    updates.push({ id: variant.id, mediaId: args.primaryMediaId });
  }

  return updates;
}

export function promptOneImageType(prompts: readonly PromptOrderEntry[]) {
  const [promptOne] = [...prompts].sort((left, right) => {
    const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
    const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return left.imageType.localeCompare(right.imageType);
  });
  return promptOne?.imageType ?? null;
}

export function imageForPromptOne<T extends { imageType: string }>(
  images: readonly T[],
  imageType: string | null,
) {
  if (!imageType) return undefined;
  return images.find((image) => image.imageType === imageType);
}

export function shopifyMediaReadiness(status: string | null | undefined) {
  const normalized = status?.toUpperCase();
  if (normalized === "READY") return "ready" as const;
  if (normalized === "FAILED") return "failed" as const;
  return "pending" as const;
}
