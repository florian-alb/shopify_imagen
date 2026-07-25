export type VisualReferencePosition = {
  position: number;
  groupPosition?: number;
};

export function visualReferencePosition(
  reference: VisualReferencePosition,
) {
  return reference.groupPosition ?? reference.position;
}

export function orderVisualReferences<T extends VisualReferencePosition>(
  references: readonly T[],
) {
  return [...references].sort(
    (left, right) =>
      visualReferencePosition(left) - visualReferencePosition(right),
  );
}

export function moveReferenceId<T extends string>(
  referenceIds: readonly T[],
  referenceId: T,
  direction: -1 | 1,
) {
  const currentIndex = referenceIds.indexOf(referenceId);
  const nextIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= referenceIds.length
  ) {
    return [...referenceIds];
  }

  const next = [...referenceIds];
  [next[currentIndex], next[nextIndex]] = [
    next[nextIndex],
    next[currentIndex],
  ];
  return next;
}
