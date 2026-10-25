import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/lib/convex";

export type ListedBulkOperation = NonNullable<
  FunctionReturnType<typeof api.bulkOperations.list>
>["page"][number];
export type BulkHistoryCursor = FunctionArgs<
  typeof api.bulkOperations.list
>["cursor"];
export type OperationFilter = NonNullable<
  FunctionArgs<typeof api.bulkOperations.list>["operation"]
>;

