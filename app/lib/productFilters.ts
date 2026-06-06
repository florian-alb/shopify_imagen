import { generationStatusLabels, type GenerationStatus } from "@/lib/status";

export type ProductSearch = {
  q?: string;
  type?: string;
  collection?: string;
  shopifyStatus?: string;
  status?: GenerationStatus;
  page?: number;
  pageSize?: number;
};

function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function validateProductSearch(search: Record<string, unknown>): ProductSearch {
  const status = optionalString(search.status);
  const page = parsePositiveInt(search.page);
  const pageSize = parsePageSize(search.pageSize);
  return {
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    type: optionalString(search.type),
    collection: optionalString(search.collection),
    shopifyStatus: optionalString(search.shopifyStatus)?.toUpperCase(),
    status: status && status in generationStatusLabels ? (status as GenerationStatus) : undefined,
    page: page && page > 1 ? page : undefined,
    pageSize: pageSize && pageSize !== 20 ? pageSize : undefined
  };
}

function parsePositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : undefined;
  return Number.isFinite(parsed) && parsed && parsed > 0 ? Math.floor(parsed) : undefined;
}

function parsePageSize(value: unknown) {
  const parsed = parsePositiveInt(value);
  return parsed && [20, 50, 100].includes(parsed) ? parsed : undefined;
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
