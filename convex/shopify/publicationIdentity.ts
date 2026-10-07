type PublicationImage = {
  _id: string;
  storageUrl?: string | null;
  generationTarget?: unknown;
  visualGroupId?: string | null;
};

export function publicationFingerprint(args: {
  images: PublicationImage[];
  publishMode: string;
  replaceExisting: boolean;
  replaceVariantMedia: boolean;
}) {
  return JSON.stringify({
    images: args.images
      .map((image) => [
        image._id,
        image.storageUrl,
        image.generationTarget ?? null,
        image.visualGroupId ?? null,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    publishMode: args.publishMode,
    replaceExisting: args.replaceExisting,
    replaceVariantMedia: args.replaceVariantMedia,
  });
}

export function reconcilePublishedMedia(
  row: { expectedAlt: string; baselineMediaIds: string[] },
  media: Array<{ id: string; alt?: string | null }>,
) {
  const baseline = new Set(row.baselineMediaIds);
  const matches = media.filter(
    (node) => !baseline.has(node.id) && node.alt === row.expectedAlt,
  );
  // A missing or ambiguous result cannot prove rejection by Shopify. Keep the
  // persisted intent unresolved rather than issuing a second creation request.
  return matches.length === 1 ? matches[0].id : null;
}
