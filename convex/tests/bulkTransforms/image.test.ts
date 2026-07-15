// @vitest-environment node

import sharp from "sharp";
import { describe, expect, test } from "vitest";

import {
  flipImageHorizontally,
  imageSha256,
  UnsupportedAnimatedImageError,
} from "../../bulkTransforms/image";

describe("bulk image transform", () => {
  test("mirrors pixels horizontally", async () => {
    const pixels = Buffer.alloc(20 * 3);
    for (let x = 0; x < 20; x += 1) {
      pixels[x * 3 + (x < 10 ? 0 : 2)] = 255;
    }
    const source = await sharp(pixels, {
      raw: { width: 20, height: 1, channels: 3 },
    })
      .png()
      .withExif({ IFD0: { Artist: "private bulk metadata" } })
      .toBuffer();

    expect((await sharp(source).metadata()).exif).toBeDefined();

    const transformed = await flipImageHorizontally(source);
    const transformedMetadata = await sharp(transformed).metadata();
    const { data, info } = await sharp(transformed)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(transformedMetadata.format).toBe("webp");
    expect(transformedMetadata.exif).toBeUndefined();
    expect(transformedMetadata.xmp).toBeUndefined();
    expect(transformedMetadata.icc).toBeUndefined();
    expect(transformedMetadata.orientation).toBeUndefined();
    expect(info.width).toBe(20);
    expect(info.height).toBe(1);
    expect(data[2]).toBe(255);
    expect(data[0]).toBe(0);
    const lastPixel = (info.width - 1) * info.channels;
    expect(data[lastPixel]).toBe(255);
    expect(data[lastPixel + 2]).toBe(0);
    expect(imageSha256(transformed)).toHaveLength(64);
  });

  test("rejects animated inputs instead of silently dropping frames", async () => {
    const animatedGif = Buffer.from(
      "47494638396101000100800000000000ffffff21f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024c01003b",
      "hex",
    );

    await expect(flipImageHorizontally(animatedGif)).rejects.toBeInstanceOf(
      UnsupportedAnimatedImageError,
    );
  });
});
