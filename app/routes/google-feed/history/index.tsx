import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedHistoryPage } from "@/features/google-feed/components/GoogleFeedHistoryPage"

export const Route = createFileRoute("/google-feed/history/")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  component: GoogleFeedHistoryRoute,
})

function GoogleFeedHistoryRoute() {
  return <GoogleFeedHistoryPage returnTo={Route.useSearch().returnTo} />
}
