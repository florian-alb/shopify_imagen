import { createFileRoute } from "@tanstack/react-router";

import { BulkOperationsPage } from "@/features/bulk-operations/components/BulkOperationsPage";

import { validateBulkOperationSearch } from "@/features/bulk-operations/lib/bulkOperationSearch";

export const Route = createFileRoute("/bulk-operations/")({
  validateSearch: validateBulkOperationSearch,
  component: BulkOperationsRoute,
});

function BulkOperationsRoute() {
  return <BulkOperationsPage search={Route.useSearch()} />;
}
