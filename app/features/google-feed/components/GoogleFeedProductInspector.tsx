import { useAction, useQuery } from "convex/react"
import { ChevronDown, LockKeyhole } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Id } from "@/lib/convex"
import { attributeLabels, type GoogleFeedAttribute } from "../constants"
import { formatFeedValue } from "../lib/conflicts"
import type { FeedSearch } from "../lib/workspace-search"
import type { FeedDetails, FeedView } from "../types"
import { GoogleFeedProductDecision } from "./GoogleFeedProductDecision"
import { GoogleFeedProductChanges } from "./GoogleFeedProductChanges"
import { GoogleFeedRuleComparison } from "./GoogleFeedRuleComparison"
import { GoogleFeedShopifyProductLink } from "./GoogleFeedShopifyProductLink"
import { GoogleFeedVariantRows } from "./GoogleFeedVariantRows"
import { GoogleValueSelect } from "./GoogleValueSelect"

export function GoogleFeedProductInspector({
  productId,
  view,
  returnSearch,
  position,
  canSkip,
  onNext,
}: {
  productId: Id<"products">
  view: FeedView
  returnSearch: FeedSearch
  position: number
  canSkip: boolean
  onNext: () => void
}) {
  const details = useQuery(api.googleFeedWorkspace.productDetails, { productId, view })
  if (!details)
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  return (
    <Inspector
      details={details}
      view={view}
      returnSearch={returnSearch}
      position={position}
      canSkip={canSkip}
      onNext={onNext}
    />
  )
}

function Inspector({
  details,
  view,
  returnSearch,
  position,
  canSkip,
  onNext,
}: {
  details: FeedDetails
  view: FeedView
  returnSearch: FeedSearch
  position: number
  canSkip: boolean
  onNext: () => void
}) {
  const [chosenAttribute, setAttribute] = useState<GoogleFeedAttribute>("gender")
  const attribute = details.product.attributes.includes(chosenAttribute)
    ? chosenAttribute
    : details.product.attributes[0]
  const rows = details.rows.filter((row) => row.attribute === attribute)
  const group = details.conflicts.find((item) => item.attribute === attribute)
  const manual = details.manualRows.filter(
    (row) =>
      row.attribute === attribute &&
      (view === "review" || !rows.some((selected) => selected.id === row.id)),
  )
  const current = [
    ...new Set(
      rows.map((row) =>
        row.currentValue === null ? "—" : formatFeedValue(row.attribute, row.currentValue),
      ),
    ),
  ].join(" · ")
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <h2 className="break-words text-xl font-semibold tracking-tight">
          {details.product.title}
        </h2>
        <GoogleFeedShopifyProductLink productId={details.product.id} />
        {attribute ? (
          <p className="break-words text-sm text-muted-foreground">
            {attributeLabels[attribute]} · Shopify : {current}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Plus aucune modification dans cette vue.</p>
        )}
        {details.product.attributes.length > 1 ? (
          <GoogleValueSelect
            value={attribute}
            options={details.product.attributes.map((value) => ({
              value,
              label: attributeLabels[value],
            }))}
            label="Champ du produit"
            onChange={(value) => setAttribute(value as GoogleFeedAttribute)}
          />
        ) : null}
      </header>
      {group ? <GoogleFeedRuleComparison group={group} returnSearch={returnSearch} /> : null}
      {view === "review" && attribute && rows.some((row) => row.sourceKind !== "manual") ? (
        <GoogleFeedProductDecision
          key={JSON.stringify(rows.map((row) => [row.id, row.updatedAt]))}
          productId={details.product.id}
          attribute={attribute}
          rows={rows}
          position={position}
          canSkip={canSkip}
          onNext={onNext}
        >
          <ManualCorrections rows={manual} />
        </GoogleFeedProductDecision>
      ) : null}
      {view !== "review" || rows.some((row) => row.status === "invalid") ? (
        <GoogleFeedProductChanges
          rows={rows}
          errors={view === "errors" || rows.some((row) => row.status === "invalid")}
        />
      ) : null}
      {view !== "review" || !rows.some((row) => row.sourceKind !== "manual") ? (
        <ManualCorrections rows={manual} />
      ) : null}
      {view === "errors" && rows.length ? (
        <RetryProduct productId={details.product.id} onNext={onNext} />
      ) : null}
    </div>
  )
}

function ManualCorrections({ rows }: { rows: FeedDetails["manualRows"] }) {
  if (!rows.length) return null
  return (
    <details className="border-y py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground">
        <LockKeyhole className="size-4" />
        Corrections manuelles <span className="tabular-nums">{rows.length}</span>
        <ChevronDown className="ml-auto size-4" />
      </summary>
      <GoogleFeedVariantRows rows={rows} />
    </details>
  )
}

function RetryProduct({ productId, onNext }: { productId: Id<"products">; onNext: () => void }) {
  const retry = useAction(api.googleFeedActions.publish)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      const result = await retry({ retryProductId: productId })
      if (result.failed) toast.error(`${result.failed} valeurs toujours en erreur`)
      else {
        toast.success(`${result.published} valeurs publiées`)
        onNext()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex justify-end border-t pt-4">
      <Button variant="outline" disabled={busy} onClick={() => void submit()}>
        {busy ? "Relance…" : "Réessayer ce produit"}
      </Button>
    </div>
  )
}
