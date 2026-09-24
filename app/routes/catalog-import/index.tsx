import { createFileRoute } from "@tanstack/react-router"
import { CatalogHome } from "@/features/catalog-import/components/CatalogHome"

export const Route = createFileRoute("/catalog-import/")({
  component: CatalogHome,
})
