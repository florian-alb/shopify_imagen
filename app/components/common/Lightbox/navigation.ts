export function normalizeLightboxIndex(index: number, imageCount: number) {
  if (imageCount <= 0) return 0;
  return ((index % imageCount) + imageCount) % imageCount;
}

export function getLightboxNextIndex(
  index: number,
  delta: number,
  imageCount: number,
) {
  if (imageCount <= 0) return 0;
  return normalizeLightboxIndex(index + delta, imageCount);
}
