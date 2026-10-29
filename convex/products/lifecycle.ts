import { ConvexError } from "convex/values";

type ProductPresence = { shopifyDeletedAt?: number | null };

/** Archived Shopify products stay readable through historical job references. */
export function isProductActive<T extends ProductPresence>(product: T | null | undefined): product is T {
  return Boolean(product && product.shopifyDeletedAt == null);
}

export function assertProductActive(product: ProductPresence | null | undefined): asserts product is ProductPresence {
  if (!isProductActive(product))
    throw new ConvexError("Ce produit n’existe plus dans Shopify. Son historique est conservé.");
}
