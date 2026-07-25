import { createFileRoute } from "@tanstack/react-router";

import { BulkOperationsPage } from "@/features/bulk-operations/components/BulkOperationsPage";

export const Route = createFileRoute("/bulk-operations/")({
  component: BulkOperationsRoute,
});

function BulkOperationsRoute() {
  return <BulkOperationsPage />;
}
