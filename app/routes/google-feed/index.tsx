import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedCatalogPage } from "@/features/google-feed/components/GoogleFeedCatalogPage"
import { validateGoogleFeedCatalogSearch } from "@/features/google-feed/lib/search"

export const Route = createFileRoute("/google-feed/")({
  validateSearch: validateGoogleFeedCatalogSearch,
  component: GoogleFeedCatalogRoute,
})

function GoogleFeedCatalogRoute() {
  return <GoogleFeedCatalogPage search={Route.useSearch()} />
}
