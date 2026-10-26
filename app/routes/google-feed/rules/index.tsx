import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedRulesPage } from "@/features/google-feed/components/GoogleFeedRulesPage"

export const Route = createFileRoute("/google-feed/rules/")({
  validateSearch: (search: Record<string, unknown>): { ruleId?: string; returnTo?: string } => ({
    ruleId: typeof search.ruleId === "string" ? search.ruleId : undefined,
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  component: GoogleFeedRulesRoute,
})

function GoogleFeedRulesRoute() {
  const { ruleId, returnTo } = Route.useSearch()
  return <GoogleFeedRulesPage key={ruleId} initialRuleId={ruleId} returnTo={returnTo} />
}
