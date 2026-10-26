import { useMutation } from "convex/react"
import { Check, LockKeyhole, Pencil, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/convex"
import { ageGroupOptions, genderOptions, attributeLabels } from "../constants"
import { formatFeedValue } from "../lib/conflicts"
import type { FeedRow } from "../types"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"
import { GoogleValueSelect } from "./GoogleValueSelect"

export function feedError(
  row: Pick<FeedRow, "error" | "variantId"> & { status?: FeedRow["status"] },
) {
  if (row.error?.includes("Owner does not exist"))
    return row.variantId
      ? "Variante introuvable dans Shopify."
      : "Produit introuvable dans Shopify."
  return (
    row.error ?? (row.status === "invalid" ? "Valeur invalide." : "Échec de publication Shopify.")
  )
}

export function GoogleFeedVariantRows({
  rows,
  errors = false,
}: {
  rows: FeedRow[]
  errors?: boolean
}) {
  return (
    <ul className="flex max-h-[32rem] flex-col divide-y overflow-y-auto">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-3 py-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 break-words">
                {row.variantTitle}
                {row.sourceKind === "manual" ? (
                  <LockKeyhole
                    aria-label="Correction manuelle"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                ) : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {attributeLabels[row.attribute]} ·{" "}
                {row.currentValue === null ? "—" : formatFeedValue(row.attribute, row.currentValue)}{" "}
                → {formatFeedValue(row.attribute, row.proposedValue)}
              </p>
            </div>
            <RowEditor key={`${row.id}:${row.updatedAt}`} row={row} />
          </div>
          {errors ? (
            <div className="break-words text-xs text-destructive">
              <p>{feedError(row)}</p>
              {row.error && row.error !== feedError(row) ? (
                <details className="mt-1">
                  <summary className="cursor-pointer">Détail Shopify</summary>
                  <p className="mt-2">{row.error}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function RowEditor({ row }: { row: FeedRow }) {
  const update = useMutation(api.googleFeed.updateDraftValue)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.proposedValue)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await update({ draftId: row.id, value, expectedUpdatedAt: row.updatedAt })
      setEditing(false)
      toast.success("Valeur enregistrée")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  if (!editing)
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Modifier ${attributeLabels[row.attribute]} · ${row.variantTitle}`}
        disabled={row.status === "publishing"}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
    )
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {row.attribute === "google_product_category" ? (
        <GoogleCategoryCombobox compact value={value} onChange={setValue} />
      ) : (
        <GoogleValueSelect
          value={value}
          options={row.attribute === "gender" ? genderOptions : ageGroupOptions}
          label={`Valeur de ${row.variantTitle}`}
          onChange={setValue}
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Enregistrer la valeur"
        disabled={busy || !value}
        onClick={() => void save()}
      >
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Annuler la modification"
        disabled={busy}
        onClick={() => setEditing(false)}
      >
        <X />
      </Button>
    </div>
  )
}
