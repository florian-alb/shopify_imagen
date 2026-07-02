import { useMemo } from "react";

import type { Doc } from "@/lib/convex";

import {
  createProductImagesViewModel,
  type ProductImagesViewModel,
} from "../lib/productImagesViewModel";

export function useProductImagesViewModel({
  product,
  images,
  prompts,
  storeHandle,
}: {
  product: Doc<"products"> | null | undefined;
  images: Doc<"generatedImages">[];
  prompts: Doc<"promptTemplates">[] | undefined;
  storeHandle: string | null | undefined;
}): ProductImagesViewModel {
  return useMemo(
    () =>
      createProductImagesViewModel({
        product,
        images,
        prompts,
        storeHandle,
      }),
    [product, images, prompts, storeHandle],
  );
}
