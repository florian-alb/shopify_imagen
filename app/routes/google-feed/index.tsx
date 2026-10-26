import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedWorkspacePage } from "@/features/google-feed/components/GoogleFeedWorkspacePage"
import { validateFeedSearch } from "@/features/google-feed/lib/workspace-search"

export const Route = createFileRoute("/google-feed/")({
  validateSearch: validateFeedSearch,
  component: GoogleFeedCatalogRoute,
})

function GoogleFeedCatalogRoute() {
  return <GoogleFeedWorkspacePage search={Route.useSearch()} />
}
