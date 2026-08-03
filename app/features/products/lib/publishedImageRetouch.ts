import type { Doc } from "@/lib/convex";

export function indexRetouchablePublishedImages(
  images: Doc<"generatedImages">[],
) {
  const imagesByMediaId = new Map<string, Doc<"generatedImages">>();

  for (const image of images) {
    if (
      image.status !== "uploaded" ||
      !image.storageUrl ||
      !image.shopifyMediaId ||
      imagesByMediaId.has(image.shopifyMediaId)
    ) {
      continue;
    }

    imagesByMediaId.set(image.shopifyMediaId, image);
  }

  return imagesByMediaId;
}
