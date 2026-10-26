import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { describeRuleCondition, formatFeedValue } from "../lib/conflicts"
import type { FeedSearch } from "../lib/workspace-search"
import type { ConflictAttribute } from "../types"

export function GoogleFeedRuleComparison({
  group,
  returnSearch,
}: {
  group: ConflictAttribute
  returnSearch: FeedSearch
}) {
  return (
    <div className="flex flex-col divide-y border-y">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)] gap-3 py-3 text-xs text-muted-foreground sm:grid"
      >
        <span>Règle</span>
        <span>Proposition</span>
        <span>Correspondance</span>
      </div>
      {group.rules.map((rule) => {
        const matched = rule.evidence.filter((item) => item.matched)
        return (
          <div
            key={rule.id}
            className="grid gap-3 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)]"
          >
            <div className="min-w-0">
              {rule.missing ? (
                <span>{rule.name}</span>
              ) : (
                <Link
                  to="/google-feed/rules"
                  search={{ ruleId: rule.id, returnTo: JSON.stringify(returnSearch) }}
                  className="inline-flex max-w-full items-start gap-1 hover:underline"
                >
                  <span className="min-w-0 break-words">{rule.name}</span>
                  <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                </Link>
              )}
              {rule.changed || !rule.active ? (
                <p className="mt-1 text-xs text-warning">
                  {rule.missing ? "Supprimée" : !rule.active ? "Inactive" : "À réanalyser"}
                </p>
              ) : null}
            </div>
            <strong className="font-medium">
              {rule.value === null ? "—" : formatFeedValue(group.attribute, rule.value)}
            </strong>
            <details className="min-w-0 break-words">
              <summary className="cursor-pointer">
                {matched[0] ? describeRuleCondition(matched[0]) : "Aucun critère actuel"}
                {matched.length > 1 ? ` (+${matched.length - 1})` : ""}
              </summary>
              <div className="mt-3 flex flex-col gap-3 text-xs text-muted-foreground">
                <p>{rule.conditionMode === "or" ? "Au moins un critère" : "Tous les critères"}</p>
                {rule.evidence.map((item, index) => (
                  <div key={index}>
                    <p>
                      {item.matched ? "✓ " : "— "}
                      {describeRuleCondition(item)}
                    </p>
                    {item.actualValues.length ? (
                      <p className="mt-1">
                        {item.actualValues.join(" · ")}
                        {item.hasMoreValues ? "…" : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )
      })}
    </div>
  )
}
