import { ConvexError } from "convex/values";

type ShopifyUserError = {
  field?: string[] | string | null;
  message: string;
};

function shopifyErrorMessage(errors: ShopifyUserError[] | null | undefined) {
  if (!errors?.length) return null;
  return errors
    .map((error) => {
      const field = Array.isArray(error.field)
        ? error.field.join(".")
        : error.field;
      return field ? `${field}: ${error.message}` : error.message;
    })
    .join("; ");
}

export function throwUserErrors(
  errors: ShopifyUserError[] | null | undefined,
  label: string,
) {
  const message = shopifyErrorMessage(errors);
  if (message) throw new ConvexError(`${label}: ${message}`);
}

export function sameIds(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((id) => right.includes(id)) &&
    new Set(right).size === right.length
  );
}

export function buildMediaMoves(
  mediaNodes: Array<{ id: string; mediaContentType: string }>,
  orderedImageIds: string[],
) {
  const desiredImages = [...orderedImageIds];
  const targetIds = mediaNodes.map((media) =>
    media.mediaContentType === "IMAGE" ? desiredImages.shift()! : media.id,
  );
  const workingIds = mediaNodes.map((media) => media.id);
  const moves: Array<{ id: string; newPosition: string }> = [];

  targetIds.forEach((id, targetIndex) => {
    const currentIndex = workingIds.indexOf(id);
    if (currentIndex === targetIndex) return;
    moves.push({ id, newPosition: String(targetIndex) });
    workingIds.splice(currentIndex, 1);
    workingIds.splice(targetIndex, 0, id);
  });

  return moves;
}
