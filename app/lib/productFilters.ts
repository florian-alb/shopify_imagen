import { generationStatusLabels, type GenerationStatus } from "@/lib/status";

export type ProductSearch = {
  q?: string;
  type?: string;
  collection?: string;
  shopifyStatus?: string;
  status?: GenerationStatus;
  offset?: number;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function validateProductSearch(search: Record<string, unknown>): ProductSearch {
  const status = optionalString(search.status);
  const offset = typeof search.offset === "number" ? search.offset : typeof search.offset === "string" ? Number.parseInt(search.offset, 10) : undefined;
  return {
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    type: optionalString(search.type),
    collection: optionalString(search.collection),
    shopifyStatus: optionalString(search.shopifyStatus)?.toUpperCase(),
    status: status && status in generationStatusLabels ? (status as GenerationStatus) : undefined,
    offset: Number.isFinite(offset) && offset && offset > 0 ? Math.floor(offset) : undefined
  };
}

export function productFilterArgs(search: ProductSearch) {
  return {
    search: search.q,
    productType: search.type,
    collection: search.collection,
    shopifyStatus: search.shopifyStatus,
    generationStatus: search.status
  };
}
