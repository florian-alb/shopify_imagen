import type { OperationFilter } from "../types";
export type BulkOperationSearch = { operation?: Exclude<OperationFilter, "all"> };
export function validateBulkOperationSearch(search: Record<string, unknown>): BulkOperationSearch {
  return {
    operation:
      search.operation === "reorder_media" || search.operation === "flip_horizontal"
        ? search.operation
        : undefined,
  };
}
