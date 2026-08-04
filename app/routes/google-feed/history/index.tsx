import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedHistoryPage } from "@/features/google-feed/components/GoogleFeedHistoryPage"

export const Route = createFileRoute("/google-feed/history/")({
  component: GoogleFeedHistoryRoute,
})

function GoogleFeedHistoryRoute() {
  return <GoogleFeedHistoryPage />
}
