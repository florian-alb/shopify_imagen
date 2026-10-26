import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api, type Id } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { decode } from "../../../../convex/catalogue/model"
import { allImportElements, hasImportElements, type ImportSelection } from "../../../../convex/catalogue/importSelection"

type Props = {
  id: Id<"catalogues">
  version: number
  partial: boolean
  incompleteCount: number
  close: () => void
}
const options: Array<{ key: keyof ImportSelection; title: string; description?: string }> = [
  { key: "products", title: "Produits", description: "Nouveaux produits en brouillon." },
  { key: "collections", title: "Collections" },
  { key: "menu", title: "Menu", description: "Non affecté au thème." },
]

export function ImportConfirmation({ id, version, partial, incompleteCount, close }: Props) {
  const raw = useQuery(api.catalogues.destinationShops)
  const shops: Array<{ id: Id<"shops">; name?: string; domain: string }> = raw ? decode(raw) : []
  const start = useMutation(api.catalogues.startImport)
  const [shopId, setShopId] = useState("")
  const [selection, setSelection] = useState<ImportSelection>({ ...allImportElements })
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const hasSelection = hasImportElements(selection)

  async function confirm() {
    setBusy(true)
    setError("")
    try {
      await start({ id, shopId: shopId as Id<"shops">, allowPartial: accepted, version, selection })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="import-destination">Boutique</FieldLabel>
        <select
          id="import-destination"
          className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          value={shopId}
          disabled={busy}
          onChange={(e) => setShopId(e.target.value)}
        >
          <option value="">Choisir une boutique</option>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name ? `${shop.name} · ${shop.domain}` : shop.domain}</option>)}
        </select>
      </Field>
      <FieldSet disabled={busy}>
        <FieldLegend variant="label">À importer</FieldLegend>
        <FieldGroup className="gap-3">
          {options.map((option) => (
            <Field key={option.key} orientation="horizontal">
              <Checkbox
                id={`import-${option.key}`}
                checked={selection[option.key]}
                aria-describedby={selection[option.key] && option.description ? `import-${option.key}-help` : undefined}
                onCheckedChange={(checked) => setSelection((current) => ({ ...current, [option.key]: checked === true }))}
              />
              <FieldContent>
                <FieldLabel htmlFor={`import-${option.key}`}>{option.title}</FieldLabel>
                {selection[option.key] && option.description && <FieldDescription id={`import-${option.key}-help`}>{option.description}</FieldDescription>}
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      {partial && (
        <Field orientation="horizontal">
          <Checkbox id="import-partial" checked={accepted} disabled={busy} onCheckedChange={(checked) => setAccepted(checked === true)} />
          <FieldLabel htmlFor="import-partial">
            {incompleteCount > 0
              ? `Importer malgré ${incompleteCount} ${incompleteCount === 1 ? "fiche incomplète" : "fiches incomplètes"}`
              : "Importer malgré les données incomplètes"}
          </FieldLabel>
        </Field>
      )}
      {!hasSelection && <p role="status" className="text-sm">Choisissez au moins un élément.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={!shopId || !hasSelection || (partial && !accepted) || busy} onClick={() => void confirm()}>
        {busy ? "Préparation…" : "Importer"}
      </Button>
    </FieldGroup>
  )
}
