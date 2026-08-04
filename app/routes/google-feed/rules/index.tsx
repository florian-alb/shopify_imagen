import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedRulesPage } from "@/features/google-feed/components/GoogleFeedRulesPage"

export const Route = createFileRoute("/google-feed/rules/")({
  component: GoogleFeedRulesRoute,
})

function GoogleFeedRulesRoute() {
  return <GoogleFeedRulesPage />
}
