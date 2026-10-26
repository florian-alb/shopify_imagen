import { useMutation } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { api, type Id } from "@/lib/convex"
import { ageGroupOptions, genderOptions } from "../constants"
import { formatFeedValue } from "../lib/conflicts"
import type { ConflictAttribute } from "../types"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"
import { GoogleFeedConflictVariants } from "./GoogleFeedConflictVariants"

export function GoogleFeedConflictDecision({
  productId,
  group,
  onSkip,
}: {
  productId: Id<"products">
  group: ConflictAttribute
  onSkip: () => void
}) {
  const resolve = useMutation(api.googleFeedConflicts.resolve)
  const [value, setValue] = useState("")
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const selected = group.drafts.filter((draft) => !excluded.has(draft.id))
  const options = group.attribute === "gender" ? genderOptions : ageGroupOptions

  async function submit() {
    setBusy(true)
    try {
      const result = await resolve({
        productId,
        attribute: group.attribute,
        value,
        drafts: selected.map(({ id, updatedAt }) => ({ id, updatedAt })),
      })
      toast.success(
        `${result.updated} champ${result.updated > 1 ? "s" : ""} préparé${result.updated > 1 ? "s" : ""}`,
        {
          description: `${result.preserved ? `${result.preserved} correction(s) conservée(s). ` : ""}Aucune donnée Shopify publiée.`,
        },
      )
    } catch (error) {
      toast.error("Résolution impossible", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-5" aria-label="Décision pour ce produit">
      <FieldGroup>
        <FieldSet disabled={busy}>
          <FieldLegend>Votre décision pour ce produit</FieldLegend>
          {group.attribute === "google_product_category" ? (
            <GoogleCategoryCombobox value={value || null} onChange={setValue} />
          ) : (
            <RadioGroup
              value={value}
              onValueChange={setValue}
              disabled={busy}
              className="flex flex-wrap gap-x-7 gap-y-4"
              aria-label="Valeur à appliquer"
            >
              {options.map((option) => (
                <Field key={option.value} orientation="horizontal" className="w-auto">
                  <RadioGroupItem id={`resolve-${option.value}`} value={option.value} />
                  <FieldLabel htmlFor={`resolve-${option.value}`}>{option.label}</FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          )}
        </FieldSet>
        <Field orientation="horizontal">
          <Checkbox
            id="resolve-all-variants"
            disabled={busy}
            checked={
              selected.length === group.drafts.length
                ? true
                : selected.length
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) =>
              setExcluded(
                checked === true ? new Set() : new Set(group.drafts.map((draft) => draft.id)),
              )
            }
          />
          <FieldLabel htmlFor="resolve-all-variants">
            {group.attribute === "google_product_category"
              ? "Appliquer à ce champ du produit"
              : group.drafts.length === 1
                ? "Appliquer à cette variante en conflit"
                : `Appliquer aux ${group.drafts.length} variantes en conflit de ce produit`}
          </FieldLabel>
        </Field>
      </FieldGroup>
      <GoogleFeedConflictVariants
        group={group}
        excluded={excluded}
        disabled={busy}
        onToggle={(id) =>
          setExcluded((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
      />
      <FieldDescription>
        {group.manualCount
          ? `Corrections manuelles déjà enregistrées : ${group.manualCount}. `
          : ""}
        Les corrections manuelles existantes sont conservées.
      </FieldDescription>
      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="min-h-11 w-full sm:min-h-9 sm:w-auto"
            disabled={busy}
            onClick={onSkip}
          >
            Laisser en attente
          </Button>
          <Button
            className="h-auto min-h-11 w-full whitespace-normal sm:min-h-9 sm:w-auto"
            disabled={busy || !value || !selected.length}
            onClick={() => void submit()}
          >
            {busy
              ? "Validation…"
              : `Valider ${value ? formatFeedValue(group.attribute, value) : "le choix"} pour ce produit`}
          </Button>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          {selected.length} champ{selected.length > 1 ? "s" : ""} sélectionné
          {selected.length > 1 ? "s" : ""}. Ce choix concerne uniquement ce produit. Rien n’est
          publié à cette étape.
        </p>
      </div>
    </section>
  )
}
