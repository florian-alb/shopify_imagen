import { createFileRoute } from "@tanstack/react-router"
import type { Id } from "@/lib/convex"
import { CatalogWorkspace } from "@/features/catalog-import/components/CatalogWorkspace"

export const Route = createFileRoute("/catalog-import/$exportId")({
  component: Workspace,
})
function Workspace() {
  return (
    <CatalogWorkspace
      id={Route.useParams().exportId as Id<"catalogOperations">}
    />
  )
}
