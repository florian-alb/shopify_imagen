import { useState } from "react"
import { EmptyState, StateBadge } from "@/components/page"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { attributeLabels, type GoogleFeedAttribute } from "../constants"
import { formatFeedValue } from "../lib/conflicts"
import type { ConflictDetails } from "../types"
import { GoogleFeedConflictDecision } from "./GoogleFeedConflictDecision"
import { GoogleFeedConflictRules } from "./GoogleFeedConflictRules"
import { GoogleFeedProductImage } from "./GoogleFeedProductImage"

export function GoogleFeedConflictDetail({
  details,
  onSkip,
}: {
  details: ConflictDetails
  onSkip: () => void
}) {
  const [attribute, setAttribute] = useState<GoogleFeedAttribute>("gender")
  const group =
    details.attributes.find((item) => item.attribute === attribute) ?? details.attributes[0]
  if (!group)
    return (
      <EmptyState
        title="Les conflits de ce produit sont résolus"
        body="Les valeurs choisies sont disponibles dans les modifications prêtes. Aucune écriture Shopify n’a eu lieu."
      />
    )
  const currentValues = [
    ...new Set(group.drafts.map((draft) => formatFeedValue(group.attribute, draft.currentValue))),
  ]
  const decisionKey = JSON.stringify(group.drafts.map((draft) => [draft.id, draft.updatedAt]))
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <header className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 border-b pb-5 sm:flex sm:flex-wrap sm:items-start sm:gap-4">
        <GoogleFeedProductImage
          key={details.product.featuredImageUrl}
          src={details.product.featuredImageUrl}
          large
        />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold sm:text-xl">{details.product.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {group.attribute === "google_product_category"
              ? "Champ du produit en conflit"
              : `${group.drafts.length} variante${group.drafts.length > 1 ? "s" : ""} en conflit`}{" "}
            · {attributeLabels[group.attribute]}
          </p>
          <p className="mt-2 text-sm">Dans Shopify : {currentValues.join(" · ")}</p>
        </div>
        <div className="col-start-2 sm:ml-auto">
          <StateBadge state="warning">{attributeLabels[group.attribute]} à confirmer</StateBadge>
        </div>
      </header>
      {details.attributes.length > 1 ? (
        <SegmentedControl
          value={group.attribute}
          options={details.attributes.map((item) => ({
            value: item.attribute,
            label: `${attributeLabels[item.attribute]} (${item.drafts.length})`,
          }))}
          ariaLabel="Attribut à résoudre"
          onValueChange={(value) => setAttribute(value as GoogleFeedAttribute)}
        />
      ) : null}
      <GoogleFeedConflictRules group={group} />
      <GoogleFeedConflictDecision
        key={decisionKey}
        productId={details.product.id}
        group={group}
        onSkip={onSkip}
      />
    </div>
  )
}
