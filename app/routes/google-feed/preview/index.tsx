import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedPreviewPage } from "@/features/google-feed/components/GoogleFeedPreviewPage"
import { validateGoogleFeedPreviewSearch } from "@/features/google-feed/lib/search"

export const Route = createFileRoute("/google-feed/preview/")({
  validateSearch: validateGoogleFeedPreviewSearch,
  component: GoogleFeedPreviewRoute,
})

function GoogleFeedPreviewRoute() {
  return <GoogleFeedPreviewPage search={Route.useSearch()} />
}
