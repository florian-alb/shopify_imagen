import { useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex";
import type { VariantSelection } from "../../../../convex/generationTargets";

export function useVariantGenerationSelection({
  open,
  productIds,
  selectedImageTypes,
  visualGroupIds,
}: {
  open: boolean;
  productIds: Id<"products">[];
  selectedImageTypes: string[];
  visualGroupIds?: Id<"visualGroups">[];
}) {
  const [variantSelection, setVariantSelection] =
    useState<VariantSelection>("first");
  const preview = useQuery(
    api.jobs.preview,
    open && productIds.length && selectedImageTypes.length
      ? {
          productIds,
          selectedImageTypes,
          variantSelection,
          ...(visualGroupIds ? { visualGroupIds } : {}),
        }
      : "skip",
  );
  return {
    variantSelection,
    setVariantSelection,
    preview,
    previewPending: selectedImageTypes.length > 0 && preview === undefined,
    allProductsSeparated: Boolean(
      preview &&
      productIds.length &&
      preview.separatedProductCount === productIds.length,
    ),
    resetVariantSelection: () => setVariantSelection("first"),
  };
}
