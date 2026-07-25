"use node";

import { createHash } from "node:crypto";

import sharp from "sharp";

export class UnsupportedAnimatedImageError extends Error {}

export function imageSha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function flipImageHorizontally(bytes: Buffer) {
  const image = sharp(bytes);
  const metadata = await image.metadata();
  if ((metadata.pages ?? 1) > 1) {
    throw new UnsupportedAnimatedImageError(
      "Animated images are skipped because a static mirror would discard frames.",
    );
  }
  return await image
    .rotate()
    .flop()
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}
