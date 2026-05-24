import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { ShopifyProduct } from "../types.js";
import { normalizeReferenceImage } from "../utils/imagePreprocess.js";

function extensionFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
}

export function getSupplierImageUrl(product: ShopifyProduct): string {
  const featuredUrl = product.featuredImage?.url ?? product.featuredImage?.src;
  if (featuredUrl) return featuredUrl;

  const firstImage = product.images?.find((image) => image.url || image.src);
  const url = firstImage?.url ?? firstImage?.src;
  if (!url) {
    throw new Error(`No supplier reference image found for ${product.handle}.`);
  }

  return url;
}

export async function downloadSupplierReferenceImage(product: ShopifyProduct): Promise<string> {
  const sourceUrl = getSupplierImageUrl(product);
  fs.mkdirSync(config.referencesDir, { recursive: true });
  const originalPath = path.join(config.referencesDir, `${product.handle}_supplier-reference-original${extensionFromUrl(sourceUrl)}`);
  const normalizedPath = path.join(config.referencesDir, `${product.handle}_supplier-reference-normalized.jpg`);

  if (fs.existsSync(normalizedPath)) return normalizedPath;

  if (!fs.existsSync(originalPath)) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download supplier reference image (${response.status}) from ${sourceUrl}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(originalPath, bytes);
  }

  return normalizeReferenceImage(originalPath, normalizedPath);
}
