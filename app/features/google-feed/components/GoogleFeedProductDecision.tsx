import { useMutation } from "convex/react"
import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { api, type Id } from "@/lib/convex"
import { ageGroupOptions, genderOptions, type GoogleFeedAttribute } from "../constants"
import type { FeedRow } from "../types"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"

export function GoogleFeedProductDecision({
  productId,
  attribute,
  rows,
  canSkip,
  position,
  onNext,
  children,
}: {
  productId: Id<"products">
  attribute: GoogleFeedAttribute
  rows: FeedRow[]
  canSkip: boolean
  position: number
  onNext: () => void
  children?: ReactNode
}) {
  const choose = useMutation(api.googleFeedWorkspace.choose)
  const [value, setValue] = useState("")
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const selected = rows.filter((row) => row.sourceKind !== "manual" && !excluded.has(row.id))
  const editable = rows.filter((row) => row.sourceKind !== "manual")
  const options = attribute === "gender" ? genderOptions : ageGroupOptions
  async function save() {
    setBusy(true)
    try {
      const result = await choose({
        productId,
        attribute,
        value,
        rows: selected.map(({ id, updatedAt }) => ({ id, updatedAt })),
      })
      toast.success(result.updated ? "Choix enregistré" : "Corrections conservées")
      onNext()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-6">
      {attribute === "google_product_category" ? (
        <GoogleCategoryCombobox value={value || null} onChange={setValue} />
      ) : (
        <RadioGroup
          value={value}
          onValueChange={setValue}
          disabled={busy}
          aria-label="Valeur à préparer"
          className="flex flex-wrap gap-x-7 gap-y-4"
        >
          {options.map((option) => (
            <Field key={option.value} orientation="horizontal" className="w-auto">
              <RadioGroupItem id={`feed-choice-${option.value}`} value={option.value} />
              <FieldLabel htmlFor={`feed-choice-${option.value}`}>{option.label}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      )}
      <details className="border-y py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
          {attribute === "google_product_category"
            ? `${selected.length} champ sélectionné`
            : `${selected.length} variante${selected.length === 1 ? "" : "s"} sélectionnée${selected.length === 1 ? "" : "s"}`}
          <ChevronDown className="size-4 text-muted-foreground" />
        </summary>
        <div className="mt-4 flex max-h-72 flex-col divide-y overflow-y-auto">
          <Field orientation="horizontal" className="pb-3">
            <Checkbox
              id="feed-select-all"
              disabled={busy}
              checked={
                selected.length === editable.length
                  ? true
                  : selected.length
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) =>
                setExcluded(checked === true ? new Set() : new Set(editable.map((row) => row.id)))
              }
            />
            <FieldLabel htmlFor="feed-select-all">Tout sélectionner</FieldLabel>
          </Field>
          {editable.map((row) => (
            <Field key={row.id} orientation="horizontal" className="py-3">
              <Checkbox
                id={`feed-row-${row.id}`}
                disabled={busy}
                checked={!excluded.has(row.id)}
                onCheckedChange={(checked) =>
                  setExcluded((current) => {
                    const next = new Set(current)
                    if (checked === true) next.delete(row.id)
                    else next.add(row.id)
                    return next
                  })
                }
              />
              <FieldLabel htmlFor={`feed-row-${row.id}`} className="break-words">
                {row.variantTitle}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </details>
      {children}
      <footer className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-muted-foreground">Produit {position}</span>
        <Button variant="ghost" disabled={busy || !canSkip} onClick={onNext}>
          Passer
        </Button>
        <Button
          className="min-h-11 sm:min-h-9"
          disabled={busy || !value || !selected.length}
          onClick={() => void save()}
        >
          {busy ? "Enregistrement…" : "Valider et suivant"}
        </Button>
      </footer>
    </div>
  )
}
