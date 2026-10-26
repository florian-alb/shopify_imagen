import type { FunctionReturnType } from "convex/server"
import { StateBadge } from "@/components/page"
import { Card } from "@/components/ui/card"
import type { api } from "@/lib/convex"
import { cn } from "@/lib/utils"
import { attributeLabels } from "../constants"

type Rule = FunctionReturnType<typeof api.googleFeed.listRules>[number]

export function GoogleFeedRuleList({
  rules,
  selectedId,
  onSelect,
}: {
  rules: Rule[]
  selectedId?: string
  onSelect: (rule: Rule) => void
}) {
  return (
    <Card className="h-fit gap-0 overflow-hidden rounded-lg p-0">
      <div className="divide-y">
        {rules.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Aucune règle</p>
        ) : null}
        {rules.map((rule) => (
          <button
            key={rule.id}
            type="button"
            aria-current={selectedId === rule.id ? "true" : undefined}
            className={cn(
              "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedId === rule.id && "bg-primary/5",
            )}
            onClick={() => onSelect(rule)}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">
                {rule.priority}. {rule.name}
              </span>
              <StateBadge state={rule.active ? "success" : "neutral"}>
                {rule.active ? "Active" : "Inactive"}
              </StateBadge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {attributeLabels[rule.attribute]} · {rule.conditions.length} condition
              {rule.conditions.length === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>
    </Card>
  )
}
