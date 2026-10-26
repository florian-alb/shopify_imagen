import { createFileRoute } from "@tanstack/react-router"

import { GoogleFeedRulesPage } from "@/features/google-feed/components/GoogleFeedRulesPage"

export const Route = createFileRoute("/google-feed/rules/")({
  validateSearch: (search: Record<string, unknown>): { ruleId?: string } => ({
    ruleId: typeof search.ruleId === "string" ? search.ruleId : undefined,
  }),
  component: GoogleFeedRulesRoute,
})

function GoogleFeedRulesRoute() {
  const { ruleId } = Route.useSearch()
  return <GoogleFeedRulesPage key={ruleId} initialRuleId={ruleId} />
}
