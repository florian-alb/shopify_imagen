import { validateProductSearch, type ProductSearch } from "../../../lib/productFilters";
import type { ProductPrimaryAction } from "@/lib/status";

export const productViews = ["images", "references", "history", "information"] as const;
export const productImageViews = ["all", "pending", "ready", "approved", "rejected", "published", "running", "failed"] as const;
export type ProductView = typeof productViews[number];
export type ProductImageView = typeof productImageViews[number];
export type ProductWorkspaceSearch = ProductSearch & {
  view?: ProductView;
  images?: ProductImageView;
  group?: string;
  prepare?: "publish";
};

export function validateProductWorkspaceSearch(search: Record<string, unknown>): ProductWorkspaceSearch {
  return {
    ...validateProductSearch(search),
    view: productViews.includes(search.view as ProductView) ? search.view as ProductView : undefined,
    images: productImageViews.includes(search.images as ProductImageView) ? search.images as ProductImageView : undefined,
    group: typeof search.group === "string" && search.group.trim() ? search.group.trim() : undefined,
    prepare: search.prepare === "publish" ? "publish" : undefined,
  };
}

export function productActionSearch(search: ProductSearch, action: ProductPrimaryAction): ProductWorkspaceSearch {
  const images: Partial<Record<ProductPrimaryAction, ProductImageView>> = {
    review: "pending", push: "ready", wait: "running", fix_errors: "failed", done: "published",
  };
  return {
    ...validateProductSearch(search),
    view: "images",
    images: images[action],
    prepare: action === "push" ? "publish" : undefined,
  };
}

export function adjacentProductSearch(search: ProductWorkspaceSearch): ProductWorkspaceSearch {
  // A visual group belongs to one product. Never carry it to a neighbour.
  return { ...search, group: undefined, prepare: undefined };
}

export const productActionLabels: Record<ProductPrimaryAction, string> = {
  generate: "Générer", wait: "Suivre", review: "Vérifier", push: "Publier", fix_errors: "Examiner", done: "Ouvrir",
};
