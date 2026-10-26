import { ChevronDown } from "lucide-react"
import { formatFeedValue } from "../lib/conflicts"
import type { FeedRow } from "../types"
import { feedError, GoogleFeedVariantRows } from "./GoogleFeedVariantRows"

export function GoogleFeedProductChanges({ rows, errors }: { rows: FeedRow[]; errors: boolean }) {
  const groups = new Map<string, FeedRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([
      row.attribute,
      row.currentValue,
      row.proposedValue,
      errors ? feedError(row) : null,
    ])
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return (
    <div className="flex flex-col divide-y border-y">
      {[...groups].map(([key, group]) => {
        const row = group[0]!
        return (
          <div key={key} className="flex flex-col gap-3 py-4 text-sm">
            <p>
              <span className="text-muted-foreground">
                {row.currentValue === null ? "—" : formatFeedValue(row.attribute, row.currentValue)}
              </span>{" "}
              →{" "}
              <strong className="font-medium">
                {formatFeedValue(row.attribute, row.proposedValue)}
              </strong>
            </p>
            {errors ? (
              <div className="text-destructive">
                <p>{feedError(row)}</p>
                {row.error && row.error !== feedError(row) ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer">Détail Shopify</summary>
                    <p className="mt-2 break-words">{row.error}</p>
                  </details>
                ) : null}
              </div>
            ) : null}
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-muted-foreground">
                {row.variantId
                  ? `${group.length} variante${group.length === 1 ? "" : "s"}`
                  : "Champ du produit"}
                <ChevronDown className="size-4" />
              </summary>
              <GoogleFeedVariantRows rows={group} />
            </details>
          </div>
        )
      })}
    </div>
  )
}
