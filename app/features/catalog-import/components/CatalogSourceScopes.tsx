import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import type { SourceScope } from "../../../../convex/catalogue/scope"
import { languageKey, languageLabel, marketKey, marketLabel, selectedScopes, sourceScopeLabel } from "../lib/source-scope"

type Filter = { market: string; language: string }
export function CatalogSourceScopes({ scopes, value, onChange, disabled }: {
  scopes: SourceScope[]; value: Filter; onChange: (value: Filter) => void; disabled: boolean
}) {
  const markets = [...new Set(scopes.map(marketKey))]
  const available = selectedScopes(scopes, value.market, "all")
  const languages = [...new Set(available.map(languageKey))]
  const selected = selectedScopes(scopes, value.market, value.language)
  return (
    <FieldSet>
      <FieldLegend variant="label">Marchés et langues source</FieldLegend>
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="catalogue-market">Marché</FieldLabel>
          <Select value={value.market} onValueChange={(market) => onChange({ market, language: "all" })} disabled={disabled}>
            <SelectTrigger id="catalogue-market" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">Tous les marchés</SelectItem>
              {markets.map((key) => <SelectItem key={key} value={key}>{marketLabel(key)}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="catalogue-source-language">Langue du contenu</FieldLabel>
          <Select value={value.language} onValueChange={(language) => onChange({ ...value, language })} disabled={disabled}>
            <SelectTrigger id="catalogue-source-language" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">Toutes les langues</SelectItem>
              {languages.map((key) => <SelectItem key={key} value={key}>{languageLabel(key)}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <p className="text-sm text-muted-foreground" role="status">
        {selected.length === 1 ? sourceScopeLabel(selected[0]) : `${selected.length} catalogues distincts, un par marché et langue.`}
      </p>
      <p className="text-sm text-muted-foreground">Les produits, collections et exports restent séparés par segment.</p>
    </FieldSet>
  )
}
