import { Link } from "@tanstack/react-router"
import { Check, Info, Minus, Tag, Type } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { StateBadge } from "@/components/page"
import { describeRuleCondition, formatFeedValue } from "../lib/conflicts"
import type { ConflictAttribute, ConflictRule } from "../types"

export function GoogleFeedConflictRules({ group }: { group: ConflictAttribute }) {
  return (
    <section className="flex flex-col gap-4" aria-label="Règles en conflit">
      <div>
        <h3 className="font-semibold">Pourquoi ce conflit ?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces règles ont proposé des valeurs différentes pour ce produit.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {group.rules.map((rule) => (
          <ConflictRuleExplanation key={rule.id} rule={rule} attribute={group.attribute} />
        ))}
      </div>
      {!group.rules.length ? (
        <Alert>
          <Info />
          <AlertDescription>
            Les règles d’origine ne sont plus disponibles. Vous pouvez choisir une valeur
            manuellement ou réanalyser les règles.
          </AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        <Info />
        <AlertDescription>
          Les explications utilisent les données et les règles actuelles. Une règle « au moins un
          critère » se déclenche dès qu’un seul critère correspond. Après modification d’une règle,
          relancez son analyse avant de valider.
        </AlertDescription>
      </Alert>
    </section>
  )
}

function ConflictRuleExplanation({
  rule,
  attribute,
}: {
  rule: ConflictRule
  attribute: ConflictAttribute["attribute"]
}) {
  const matching = rule.evidence.filter((item) => item.matched)
  const unmatched = rule.evidence.filter((item) => !item.matched)
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Proposition de la règle</p>
          <h4 className="mt-1 text-xl font-semibold">
            {rule.value === null ? "Indisponible" : formatFeedValue(attribute, rule.value)}
          </h4>
        </div>
        {rule.changed || !rule.active ? (
          <StateBadge state="warning">
            {rule.missing ? "Supprimée" : !rule.active ? "Inactive" : "Modifiée depuis l’analyse"}
          </StateBadge>
        ) : null}
      </div>
      <p className="break-words text-sm font-medium">{rule.name}</p>
      <p className="text-xs text-muted-foreground">
        {rule.conditionMode === "or"
          ? "Au moins un critère doit correspondre."
          : "Tous les critères doivent correspondre."}
      </p>
      <div className="flex flex-col gap-3 border-t pt-3">
        <p className="text-sm font-medium">Ce qui déclenche la règle</p>
        {matching.map((item, index) => {
          const Icon =
            item.condition.field === "product_title"
              ? Type
              : item.condition.field === "collections" || item.condition.field === "tags"
                ? Tag
                : Check
          return (
            <div key={index} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words">{describeRuleCondition(item)}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {item.actualValues.length
                    ? `Valeur trouvée : ${item.actualValues
                        .slice(0, 2)
                        .map((value) => `« ${value} »`)
                        .join(", ")}`
                    : "Aucune valeur renseignée."}
                </p>
                {item.actualValues.length > 2 || item.hasMoreValues ? (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1">Autres correspondances</summary>
                    <p className="mt-1 break-words">
                      {item.actualValues.slice(2).join(", ")}
                      {item.hasMoreValues ? "… D’autres valeurs correspondent également." : ""}
                    </p>
                  </details>
                ) : null}
                {item.variantTitles.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Variantes : {item.variantTitles.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
        {!matching.length ? (
          <p className="text-sm text-muted-foreground">
            Aucun critère ne correspond actuellement. Réanalysez les règles pour actualiser ce
            conflit.
          </p>
        ) : null}
        {unmatched.length ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">
              {unmatched.length} critère{unmatched.length > 1 ? "s" : ""} non rempli
              {unmatched.length > 1 ? "s" : ""}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {unmatched.map((item, index) => (
                <li key={index} className="flex gap-2">
                  <Minus className="size-3 shrink-0" aria-hidden="true" />
                  {describeRuleCondition(item)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {!rule.missing ? (
        <Button variant="link" size="sm" className="mt-auto self-start px-0" asChild>
          <Link to="/google-feed/rules" search={{ ruleId: rule.id }}>
            Modifier cette règle
          </Link>
        </Button>
      ) : null}
    </article>
  )
}
