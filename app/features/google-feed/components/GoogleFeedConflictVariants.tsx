import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatFeedValue } from "../lib/conflicts"
import type { ConflictAttribute } from "../types"

export function GoogleFeedConflictVariants({
  group,
  excluded,
  disabled,
  onToggle,
}: {
  group: ConflictAttribute
  excluded: Set<string>
  disabled: boolean
  onToggle: (id: string) => void
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="px-0">
          <ChevronDown data-icon="inline-start" />
          Voir{" "}
          {group.attribute === "google_product_category"
            ? "le champ du produit"
            : group.drafts.length === 1
              ? "la variante en conflit"
              : `les ${group.drafts.length} variantes en conflit`}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 max-h-80 overflow-y-auto divide-y rounded-lg border">
          {group.drafts.map((draft) => (
            <li key={draft.id}>
              <label className="flex min-h-14 cursor-pointer items-start gap-3 p-3 text-sm">
                <Checkbox
                  checked={!excluded.has(draft.id)}
                  disabled={disabled}
                  onCheckedChange={() => onToggle(draft.id)}
                  aria-label={`Résoudre ${draft.variantTitle}`}
                />
                <div className="min-w-0">
                  <p className="break-words font-medium">{draft.variantTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shopify : {formatFeedValue(group.attribute, draft.currentValue)}
                  </p>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                    {group.rules
                      .filter((rule) => draft.ruleIds.includes(rule.id))
                      .map((rule) => (
                        <li key={rule.id}>
                          {rule.name} →{" "}
                          {rule.value === null
                            ? "Règle indisponible"
                            : formatFeedValue(group.attribute, rule.value)}
                        </li>
                      ))}
                  </ul>
                </div>
              </label>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
