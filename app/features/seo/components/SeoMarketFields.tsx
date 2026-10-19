import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LanguageSelect } from "@/components/ui/language-select"
import { applySeoMarketCountry, applySeoMarketLanguage, findSeoCountry, findSeoLanguage, resolveSeoMarket, seoCountries, seoLanguages } from "../lib/market"
import type { SeoConfig } from "../types"

export function SeoMarketFields({ value, onChange, disabled = false }: {
  value: SeoConfig
  onChange: (config: SeoConfig) => void
  disabled?: boolean
}) {
  const market = resolveSeoMarket(value)
  const country = findSeoCountry(market.country)
  const language = findSeoLanguage(market.language)
  return <FieldSet>
    <FieldLegend>Marché étudié</FieldLegend>
    <FieldDescription id="seo-market-description">Le même pays et la même langue pour l’export Semrush et la boutique.</FieldDescription>
    {(market.countryConflict || market.languageConflict) && <Alert>
      <AlertDescription>
        Ce projet utilise encore deux marchés : export {value.sourceCountry || "non défini"} / {value.sourceLanguage || "non définie"}, boutique {value.targetCountry || "non défini"} / {value.targetLanguage || "non définie"}.
        Choisis {market.countryConflict ? "un pays" : "une langue"} ci-dessous pour les réunir. Les valeurs enregistrées restent conservées jusque-là.
      </AlertDescription>
    </Alert>}
    <FieldGroup className="sm:flex-row sm:items-start">
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor="seo-market-country">Pays</FieldLabel>
        <Select value={country?.code ?? market.country} onValueChange={code => onChange(applySeoMarketCountry(value, code))} required disabled={disabled}>
          <SelectTrigger id="seo-market-country" aria-describedby="seo-market-description" className="w-full"><SelectValue placeholder="Sélectionner le pays" /></SelectTrigger>
          <SelectContent position="popper"><SelectGroup>
            {market.country && !country && <SelectItem value={market.country}>{market.country}</SelectItem>}
            {seoCountries.map(option => <SelectItem key={option.code} value={option.code}><span aria-hidden="true">{option.flag}</span>{option.label}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field data-disabled={disabled || market.countryConflict}>
        <FieldLabel htmlFor="seo-market-language">Langue</FieldLabel>
        <LanguageSelect
          id="seo-market-language"
          aria-describedby="seo-market-description"
          value={language?.code ?? market.language}
          options={seoLanguages}
          onValueChange={code => onChange(applySeoMarketLanguage(value, code))}
          required
          disabled={disabled || market.countryConflict}
        />
      </Field>
    </FieldGroup>
  </FieldSet>
}
