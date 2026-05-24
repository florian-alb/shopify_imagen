import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { IMAGE_TYPE_NUMBERS } from "../prompts/fixationDetector.js";
import type { ImageType, ShopifyProduct } from "../types.js";

export function ensureRuntimeFolders(): void {
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.downloadsDir, { recursive: true });
  fs.mkdirSync(config.referencesDir, { recursive: true });
  fs.mkdirSync(config.shopifyImagesDir, { recursive: true });
  fs.mkdirSync(path.dirname(config.statePath), { recursive: true });

  if (!fs.existsSync(config.statePath)) {
    fs.writeFileSync(config.statePath, "{}\n", "utf8");
  }
}

export function getOutputFilename(product: ShopifyProduct, imageType: ImageType): string {
  return `${product.handle}_${IMAGE_TYPE_NUMBERS[imageType]}_${imageType}.jpg`;
}

export function getProductDownloadsDir(product: ShopifyProduct): string {
  return path.join(config.downloadsDir, product.handle);
}

export function getLegacyOutputPath(product: ShopifyProduct, imageType: ImageType): string {
  return path.join(config.downloadsDir, getOutputFilename(product, imageType));
}

export function getOutputPath(product: ShopifyProduct, imageType: ImageType): string {
  const productDir = getProductDownloadsDir(product);
  fs.mkdirSync(productDir, { recursive: true });
  return path.join(productDir, getOutputFilename(product, imageType));
}
