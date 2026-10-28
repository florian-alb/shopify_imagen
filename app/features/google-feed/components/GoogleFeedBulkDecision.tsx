import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { ageGroupOptions, attributeLabels, genderOptions, type GoogleFeedAttribute } from "../constants"
import { useBulkFeedDecision } from "../hooks/use-bulk-feed-decision"
import { bulkFeedTargets } from "../lib/bulk-decisions"
import type { FeedProduct } from "../types"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"
import { GoogleValueSelect } from "./GoogleValueSelect"

export function GoogleFeedBulkDecision({ products, allFiltered, onDone, onBusyChange, onCancel }: {
  products: FeedProduct[]
  allFiltered?: boolean
  onDone: (ids: string[]) => void
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
}) {
  const { details, error, reload, progress, failures, save, loaded } = useBulkFeedDecision(products, onDone, onBusyChange)
  const [chosenAttribute, setAttribute] = useState<GoogleFeedAttribute>("gender")
  const [values, setValues] = useState<Partial<Record<GoogleFeedAttribute, string>>>({})
  const attributes = useMemo(() => [...new Set((details ?? []).flatMap(({ rows }) => rows
    .filter((row) => row.sourceKind !== "manual")
    .map((row) => row.attribute)))], [details])
  const attribute = attributes.includes(chosenAttribute) ? chosenAttribute : attributes[0]
  const targets = useMemo(() => attribute ? bulkFeedTargets(details ?? [], attribute) : [], [details, attribute])
  const rowCount = useMemo(() => targets.reduce((count, target) => count + target.rows.length, 0), [targets])
  const busy = progress !== null
  const selectedIds = useMemo(() => new Set(products.map((product) => product.id)), [products])
  const visibleFailures = failures.filter((failure) => selectedIds.has(failure.productId))
  const value = attribute ? values[attribute] ?? "" : ""
  function changeValue(next: string) {
    if (attribute) setValues((current) => ({ ...current, [attribute]: next }))
  }
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Corriger la sélection</h2>
        <p className="text-sm text-muted-foreground">
          {products.length} produit{products.length === 1 ? "" : "s"} sélectionné{products.length === 1 ? "" : "s"}{allFiltered ? " sur toutes les pages" : ""}.
          {" "}Choisissez la valeur à appliquer à toutes leurs variantes à vérifier pour ce champ.
        </p>
      </header>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 text-sm">
          <p className="break-words text-destructive">{error}</p>
          <Button variant="outline" onClick={reload}>Recharger la sélection</Button>
        </div>
      ) : !details ? (
        <div aria-label="Chargement de la sélection" className="flex flex-col gap-4">
          <p role="status" className="text-sm text-muted-foreground">Chargement des propositions : {loaded} / {products.length} produits</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : attribute ? (
        <FieldGroup>
          {attributes.length > 1 ? (
            <Field>
              <FieldLabel>Champ à corriger</FieldLabel>
              <GoogleValueSelect value={attribute} disabled={busy} label="Champ à corriger"
                options={attributes.map((item) => ({ value: item, label: attributeLabels[item] }))}
                onChange={(next) => setAttribute(next as GoogleFeedAttribute)} />
            </Field>
          ) : null}
          <FieldSet disabled={busy}>
            <FieldLegend>{attributeLabels[attribute]}</FieldLegend>
            {attribute === "google_product_category" ? (
              <GoogleCategoryCombobox value={value || null} onChange={changeValue} disabled={busy} />
            ) : (
              <RadioGroup value={value} onValueChange={changeValue} disabled={busy}
                aria-label="Valeur commune à appliquer" className="flex flex-wrap gap-x-7 gap-y-4">
                {(attribute === "gender" ? genderOptions : ageGroupOptions).map((option) => (
                  <Field key={option.value} orientation="horizontal" className="w-auto">
                    <RadioGroupItem id={`feed-bulk-${option.value}`} value={option.value} />
                    <FieldLabel htmlFor={`feed-bulk-${option.value}`}>{option.label}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          </FieldSet>
        </FieldGroup>
      ) : (
        <p role="status" className="text-sm">Ces produits n’ont plus de valeurs à corriger.</p>
      )}
      {details && attribute ? (
        <div className="flex flex-col gap-3 border-y py-4 text-sm">
          <p>{targets.length} produit{targets.length === 1 ? "" : "s"} · {rowCount} valeur{rowCount === 1 ? "" : "s"} à corriger</p>
          {targets.length < products.length ? (
            <p className="text-muted-foreground">Les produits sans valeur à vérifier pour ce champ seront conservés.</p>
          ) : null}
          <p className="text-muted-foreground">Les corrections manuelles sont conservées. Les valeurs corrigées seront prêtes à publier.</p>
        </div>
      ) : null}
      {visibleFailures.length ? (
        <div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
          <p>Les produits en échec restent sélectionnés. Rechargez leurs propositions avant de réessayer.</p>
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {visibleFailures.map((failure) => (
              <li key={failure.productId} className="break-words">{failure.title} : {failure.message}</li>
            ))}
          </ul>
          <Button variant="outline" disabled={busy || !details} onClick={reload} className="self-start">Recharger les propositions</Button>
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" className="mr-auto text-sm text-muted-foreground">
          {busy ? `${progress} / ${targets.length} produits traités` : null}
        </p>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Annuler</Button>
        <Button disabled={busy || !value || !targets.length || !details || Boolean(error) || visibleFailures.length > 0}
          onClick={() => { if (attribute) void save(attribute, value) }}>
          {busy ? "Application…" : `Appliquer à ${targets.length} produit${targets.length === 1 ? "" : "s"}`}
        </Button>
      </footer>
    </div>
  )
}
