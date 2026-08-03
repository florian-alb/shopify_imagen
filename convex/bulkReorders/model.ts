export const BULK_REORDER_OPERATION = "reorder_media" as const;
export const MAX_BULK_REORDER_PRODUCTS = 200;
export const MAX_BULK_REORDER_IMAGE_POSITION = 100;

export function normalizeBulkReorderPositions(
  firstPosition: number,
  secondPosition: number,
) {
  for (const position of [firstPosition, secondPosition]) {
    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > MAX_BULK_REORDER_IMAGE_POSITION
    ) {
      throw new Error(
        `Shopify image positions must be integers between 1 and ${MAX_BULK_REORDER_IMAGE_POSITION}.`,
      );
    }
  }
  if (firstPosition === secondPosition) {
    throw new Error("Choose two different Shopify image positions.");
  }
  return { firstPosition, secondPosition };
}

export function swapBulkReorderImageIds(
  imageIds: string[],
  firstPosition: number,
  secondPosition: number,
) {
  normalizeBulkReorderPositions(firstPosition, secondPosition);
  const firstIndex = firstPosition - 1;
  const secondIndex = secondPosition - 1;
  if (imageIds.length <= Math.max(firstIndex, secondIndex)) return null;
  const target = [...imageIds];
  [target[firstIndex], target[secondIndex]] = [
    target[secondIndex]!,
    target[firstIndex]!,
  ];
  return target;
}

export function bulkReorderImageIdsMatch(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((mediaId, index) => mediaId === right[index])
  );
}

export function classifyBulkReorderOrder(args: {
  currentImageIds: string[];
  sourceImageIds: string[];
  targetImageIds: string[];
}) {
  if (bulkReorderImageIdsMatch(args.currentImageIds, args.targetImageIds)) {
    return "target" as const;
  }
  if (bulkReorderImageIdsMatch(args.currentImageIds, args.sourceImageIds)) {
    return "source" as const;
  }
  return "conflict" as const;
}

export function bulkReorderJobIsTerminal(status: string) {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}
