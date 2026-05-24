import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { upsertProductState } from "../storage/state.js";
import type { ShopifyProduct } from "../types.js";

function extensionFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
}

function imageFilename(product: ShopifyProduct, index: number, url: string): string {
  return `${product.handle}_${String(index + 1).padStart(2, "0")}${extensionFromUrl(url)}`;
}

export async function exportProductImages(product: ShopifyProduct): Promise<string> {
  const productDir = path.join(config.shopifyImagesDir, product.handle);
  fs.mkdirSync(productDir, { recursive: true });

  const manifest = {
    productId: String(product.id),
    handle: product.handle,
    title: product.title,
    images: [] as Array<{
      mediaId?: string | number | null;
      sourceUrl: string;
      localPath: string;
      altText?: string | null;
    }>
  };

  for (const [index, image] of (product.images ?? []).entries()) {
    const sourceUrl = image.url ?? image.src;
    if (!sourceUrl) continue;

    const localPath = path.join(productDir, imageFilename(product, index, sourceUrl));
    if (!fs.existsSync(localPath)) {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to export image ${sourceUrl}: ${response.status}`);
      }
      fs.writeFileSync(localPath, Buffer.from(await response.arrayBuffer()));
    }

    manifest.images.push({
      mediaId: image.mediaId ?? image.id ?? null,
      sourceUrl,
      localPath,
      altText: image.altText ?? null
    });
  }

  const manifestPath = path.join(productDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  upsertProductState(product, { status: "exported", error: null });
  return manifestPath;
}
