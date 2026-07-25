export type VisualReferencePosition = {
  position: number;
  groupPosition?: number;
};

export function visualReferencePosition(reference: VisualReferencePosition) {
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
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= referenceIds.length) {
    return [...referenceIds];
  }

  const next = [...referenceIds];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}

export function moveReferenceIdToEdge<T extends string>(
  referenceIds: readonly T[],
  referenceId: T,
  targetId: T,
  edge: "before" | "after",
) {
  const currentIndex = referenceIds.indexOf(referenceId);
  const targetIndex = referenceIds.indexOf(targetId);
  if (currentIndex < 0 || targetIndex < 0 || referenceId === targetId) {
    return [...referenceIds];
  }

  const next = referenceIds.filter((id) => id !== referenceId);
  const nextTargetIndex = next.indexOf(targetId);
  const insertionIndex =
    edge === "before" ? nextTargetIndex : nextTargetIndex + 1;
  next.splice(insertionIndex, 0, referenceId);

  return next;
}
