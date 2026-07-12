export const BULK_TRANSFORM_OPERATION = "flip_horizontal" as const;
export const BULK_TRANSFORM_ASSET_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_BULK_TRANSFORM_IMAGE_POSITIONS = 250;
export const BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS = 20 * 60 * 1000;

export type BulkTransformOperation = typeof BULK_TRANSFORM_OPERATION;
export type BulkTransformRetryPhase = "transform" | "publish" | "conflict";

export function normalizeBulkTransformImagePositions(
  positions: number[] | undefined,
) {
  if (positions === undefined) return undefined;
  const normalized = Array.from(new Set(positions)).sort((a, b) => a - b);
  if (!normalized.length) {
    throw new Error("Select at least one Shopify image position.");
  }
  if (
    normalized.some(
      (position) =>
        !Number.isInteger(position) ||
        position < 1 ||
        position > MAX_BULK_TRANSFORM_IMAGE_POSITIONS,
    )
  ) {
    throw new Error(
      `Shopify image positions must be integers between 1 and ${MAX_BULK_TRANSFORM_IMAGE_POSITIONS}.`,
    );
  }
  return normalized;
}

export function bulkTransformImagePositionIsSelected(
  selectedImagePositions: number[] | undefined,
  imagePosition: number,
) {
  return (
    selectedImagePositions === undefined ||
    selectedImagePositions.includes(imagePosition)
  );
}

export function selectedBulkTransformImageNodes<
  T extends { mediaContentType: string },
>(nodes: T[], selectedImagePositions: number[] | undefined) {
  return nodes
    .filter((media) => media.mediaContentType === "IMAGE")
    .flatMap((media, position) =>
      bulkTransformImagePositionIsSelected(selectedImagePositions, position + 1)
        ? [{ media, position }]
        : [],
    );
}

export function selectedCachedShopifyMediaIds(
  images: unknown[],
  selectedImagePositions: number[] | undefined,
) {
  return eligibleShopifyImages(images)
    .filter((image) =>
      bulkTransformImagePositionIsSelected(
        selectedImagePositions,
        image.position + 1,
      ),
    )
    .map((image) => image.mediaId);
}

export function bulkTransformMediaIdFingerprint(mediaIds: string[]) {
  const value = JSON.stringify(mediaIds);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

export function bulkTransformResumeTask(args: {
  status: string;
  retryPhase?: BulkTransformRetryPhase;
}) {
  if (args.retryPhase) {
    return { kind: "reset" as const, phase: args.retryPhase };
  }
  if (args.status === "queued") return { kind: "seed" as const };
  if (args.status === "transforming") {
    return { kind: "transform" as const };
  }
  if (args.status === "publishing") return { kind: "publish" as const };
  return null;
}

type CachedShopifyImage = {
  id?: string | null;
  mediaId?: string | null;
  url?: string | null;
  displayUrl?: string | null;
  altText?: string | null;
  [key: string]: unknown;
};

export type EligibleShopifyImage = {
  mediaId: string;
  url: string;
  altText: string | null;
  position: number;
};

function cachedImage(value: unknown): CachedShopifyImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CachedShopifyImage;
}

export function eligibleShopifyImages(
  images: unknown[],
): EligibleShopifyImage[] {
  const eligible: EligibleShopifyImage[] = [];
  images.forEach((value) => {
    const image = cachedImage(value);
    if (!image) return;
    const mediaId = image.mediaId ?? image.id;
    const url = image.url?.trim();
    if (
      !mediaId?.startsWith("gid://shopify/MediaImage/") ||
      !url?.startsWith("http")
    ) {
      return;
    }
    eligible.push({
      mediaId,
      url,
      altText: image.altText?.trim() || null,
      position: eligible.length,
    });
  });
  return eligible;
}

export function replaceCachedShopifyImageUrl(args: {
  images: unknown[];
  mediaId: string;
  url: string;
  displayUrl?: string;
}) {
  let replaced = false;
  const images = args.images.map((value) => {
    const image = cachedImage(value);
    if (!image || (image.mediaId ?? image.id) !== args.mediaId) return value;
    replaced = true;
    return { ...image, url: args.url, displayUrl: args.displayUrl ?? args.url };
  });
  return { images, replaced };
}

export function cacheBustedShopifyImageUrl(url: string, hash: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("bulk_v", hash.slice(0, 16));
    return parsed.toString();
  } catch {
    return url;
  }
}

export function bulkTransformJobIsTerminal(status: string) {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function classifyBulkTransformSource(args: {
  currentSha256: string;
  sourceSha256: string;
  transformedSha256: string;
}) {
  if (args.currentSha256 === args.transformedSha256) {
    return "transformed" as const;
  }
  if (args.currentSha256 === args.sourceSha256) return "source" as const;
  return "conflict" as const;
}

export function bulkTransformOwnsFailedUpdate(args: {
  fileUpdateAcceptedAt?: number;
  updateAcceptedByShopifyInCurrentRun: boolean;
}) {
  return Boolean(
    args.fileUpdateAcceptedAt || args.updateAcceptedByShopifyInCurrentRun,
  );
}

export function bulkTransformCanCompletePublication(args: {
  sourceState: ReturnType<typeof classifyBulkTransformSource>;
  fileStatus?: string;
  mediaStatus: string;
}) {
  return (
    args.sourceState === "transformed" &&
    args.fileStatus === "READY" &&
    args.mediaStatus === "READY"
  );
}
