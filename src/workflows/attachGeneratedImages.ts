import fs from "node:fs";
import { addGeneratedMediaToProduct, deleteProductMedia, stagedUploadProductImage } from "../shopify/adminApi.js";
import { readState, upsertProductState } from "../storage/state.js";
import type { ShopifyProduct } from "../types.js";

function altText(product: ShopifyProduct, imageType: string): string {
  return `${product.title} - ${imageType}`;
}

export async function attachGeneratedImages(product: ShopifyProduct): Promise<void> {
  const state = readState()[String(product.id)];
  const generatedImages = state?.generatedImages ?? {};
  const attachedImages = state?.attachedImages ?? {};
  const pending = Object.entries(generatedImages).filter(([imageType, localPath]) => {
    return !attachedImages[imageType] && fs.existsSync(localPath);
  });

  if (!pending.length) {
    console.log(`No generated images to attach for ${product.handle}.`);
    return;
  }

  const mediaInputs: Array<{ imageType: string; originalSource: string; alt: string }> = [];

  for (const [imageType, localPath] of pending) {
    const originalSource = await stagedUploadProductImage(localPath);
    mediaInputs.push({
      imageType,
      originalSource,
      alt: altText(product, imageType)
    });
  }

  const createdMedia = await addGeneratedMediaToProduct(
    String(product.id),
    mediaInputs.map((item) => ({
      originalSource: item.originalSource,
      alt: item.alt
    }))
  );

  const latestState = readState()[String(product.id)];
  const nextAttached = { ...(latestState?.attachedImages ?? {}) };

  for (const item of mediaInputs) {
    const media = createdMedia.find((node) => node.alt === item.alt);
    nextAttached[item.imageType] = media?.id ?? item.originalSource;
  }

  upsertProductState(product, {
    status: "attached",
    attachedImages: nextAttached,
    error: null
  });

  console.log(`Attached ${mediaInputs.length} generated image(s) to ${product.handle}.`);
}

export async function replaceProductImagesWithGenerated(product: ShopifyProduct): Promise<void> {
  const state = readState()[String(product.id)];
  const generatedImages = state?.generatedImages ?? {};
  const generatedEntries = Object.entries(generatedImages).filter(([, localPath]) => fs.existsSync(localPath));

  if (!generatedEntries.length) {
    throw new Error(`No generated images found for ${product.handle}.`);
  }

  const existingMediaIds = (product.images ?? [])
    .map((image) => image.mediaId ?? image.id)
    .filter((id): id is string | number => Boolean(id))
    .map(String);

  const mediaInputs: Array<{ imageType: string; originalSource: string; alt: string }> = [];

  for (const [imageType, localPath] of generatedEntries) {
    const originalSource = await stagedUploadProductImage(localPath);
    mediaInputs.push({
      imageType,
      originalSource,
      alt: altText(product, imageType)
    });
  }

  const createdMedia = await addGeneratedMediaToProduct(
    String(product.id),
    mediaInputs.map((item) => ({
      originalSource: item.originalSource,
      alt: item.alt
    }))
  );

  const createdByType: Record<string, string> = {};
  for (const item of mediaInputs) {
    const media = createdMedia.find((node) => node.alt === item.alt);
    createdByType[item.imageType] = media?.id ?? item.originalSource;
  }

  const createdIds = new Set(Object.values(createdByType));
  const mediaIdsToDelete = existingMediaIds.filter((id) => !createdIds.has(id));
  await deleteProductMedia(String(product.id), mediaIdsToDelete);

  upsertProductState(product, {
    status: "attached",
    attachedImages: createdByType,
    error: null
  });

  console.log(`Replaced Shopify media for ${product.handle} with ${mediaInputs.length} generated image(s).`);
}
