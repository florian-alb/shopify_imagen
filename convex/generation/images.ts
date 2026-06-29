"use node";

import sharp from "sharp";

import { intEnv } from "./runtime";

export async function normalizeReferenceImage(sourceUrl: string) {
  let response: Response;
  try {
    response = await fetch(sourceUrl);
  } catch (err) {
    throw new Error(
      `Network error fetching reference image from ${sourceUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to download supplier reference image (${response.status}).`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  // sharp (not jimp) so WebP/AVIF reference images decode correctly. Fit
  // within 1024px, flatten transparency onto white, output JPEG.
  return sharp(bytes)
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toColorspace("srgb")
    .toBuffer();
}

export async function prepareFalInputImage(generated: {
  bytes: Buffer;
  contentType: string;
  extension: string;
}) {
  const maxBytes = 10 * 1024 * 1024;
  const contentType = generated.contentType.toLowerCase();
  if (
    generated.bytes.length <= maxBytes &&
    (contentType === "image/jpeg" ||
      contentType === "image/png" ||
      contentType === "image/webp")
  ) {
    return {
      bytes: generated.bytes,
      contentType: generated.contentType,
      extension: generated.extension,
    };
  }

  const webp = await sharp(generated.bytes)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
  if (webp.length > maxBytes) {
    throw new Error(
      "Generated image is too large for fal background removal after WebP preparation.",
    );
  }
  return { bytes: webp, contentType: "image/webp", extension: "webp" };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function alphaBounds(cutoutPng: Buffer) {
  const { data, info } = await sharp(cutoutPng)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  const threshold = 8;

  for (let y = 0; y < info.height; y += 1) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x += 1) {
      if (data[row + x] <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return null;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

async function studioContactShadow(
  cutoutPng: Buffer,
  width: number,
  height: number,
) {
  const bounds = await alphaBounds(cutoutPng);
  if (!bounds) {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }

  const ambientWidth = clamp(bounds.width * 0.88, width * 0.24, width * 0.92);
  const ambientHeight = clamp(
    bounds.height * 0.09,
    height * 0.025,
    height * 0.11,
  );
  const coreWidth = ambientWidth * 0.52;
  const coreHeight = ambientHeight * 0.34;
  const centerX = clamp(
    bounds.left + bounds.width * 0.54,
    ambientWidth / 2,
    width - ambientWidth / 2,
  );
  const centerY = clamp(
    bounds.bottom + ambientHeight * 0.08,
    ambientHeight / 2,
    height - ambientHeight / 2,
  );
  const coreCenterX = clamp(
    centerX + bounds.width * 0.035,
    coreWidth / 2,
    width - coreWidth / 2,
  );
  const coreCenterY = clamp(
    bounds.bottom - coreHeight * 0.12,
    coreHeight / 2,
    height - coreHeight / 2,
  );

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <radialGradient id="ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#3a3128" stop-opacity="0.09"/>
          <stop offset="58%" stop-color="#3a3128" stop-opacity="0.038"/>
          <stop offset="100%" stop-color="#241f18" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#2f2922" stop-opacity="0.11"/>
          <stop offset="46%" stop-color="#2f2922" stop-opacity="0.048"/>
          <stop offset="100%" stop-color="#18140f" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${centerX}" cy="${centerY}" rx="${ambientWidth / 2}" ry="${ambientHeight / 2}" fill="url(#ambient)"/>
      <ellipse cx="${coreCenterX}" cy="${coreCenterY}" rx="${coreWidth / 2}" ry="${coreHeight / 2}" fill="url(#core)"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function composeBackgroundFinal(args: {
  cutoutBytes: Buffer;
  backgroundMode: "solid" | "transparent";
  backgroundColor: string;
  backgroundShadow: boolean;
}) {
  const cutoutPng = await sharp(args.cutoutBytes)
    .rotate()
    .ensureAlpha()
    .png()
    .toBuffer();
  const metadata = await sharp(cutoutPng).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error("fal background removal returned an invalid image.");
  }

  if (args.backgroundMode === "transparent" && !args.backgroundShadow) {
    return { bytes: cutoutPng, contentType: "image/png", extension: "png" };
  }

  const overlays: Array<{ input: Buffer; left?: number; top?: number }> = [];
  if (args.backgroundShadow) {
    overlays.push({
      input: await studioContactShadow(cutoutPng, width, height),
      left: 0,
      top: 0,
    });
  }
  overlays.push({ input: cutoutPng, left: 0, top: 0 });

  const background =
    args.backgroundMode === "transparent"
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : args.backgroundColor;

  const bytes = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  return { bytes, contentType: "image/png", extension: "png" };
}

export async function normalizeTransparentCutout(bytes: Buffer) {
  return await sharp(bytes).rotate().ensureAlpha().png().toBuffer();
}

// Re-encodes generated bytes as optimized WebP and strips metadata. sharp does
// not copy EXIF/ICC/XMP unless withMetadata() is called, so this shrinks files
// and removes identifying data. Falls back to original bytes if WebP encoding
// is unavailable so generation never fails on optimization.
export async function optimizeForStorage(
  bytes: Buffer,
  originalContentType: string,
  originalExtension: string,
): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  try {
    const quality = intEnv("WEBP_QUALITY", 82);
    const webp = await sharp(bytes)
      .rotate()
      .webp({ quality, effort: 4 })
      .toBuffer();
    return { bytes: webp, contentType: "image/webp", extension: "webp" };
  } catch (error) {
    console.warn(
      `WebP optimization failed, storing original bytes: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      bytes,
      contentType: originalContentType,
      extension: originalExtension,
    };
  }
}
