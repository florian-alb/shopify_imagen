import type { ReactNode } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SeoConfig } from "../types"
import { SeoMarketFields } from "./SeoMarketFields"

export type SeoConfigFieldsProps = {
  value: SeoConfig
  onChange: (config: SeoConfig) => void
  disabled?: boolean
  accordionValue?: string[]
  onAccordionChange?: (value: string[]) => void
  advancedSettings?: ReactNode
}

export function SeoConfigFields({ value, onChange, disabled = false, accordionValue, onAccordionChange, advancedSettings }: SeoConfigFieldsProps) {
  const set = <K extends keyof SeoConfig>(key: K, next: SeoConfig[K]) => onChange({ ...value, [key]: next })
  return <FieldGroup>
    <Field data-disabled={disabled}><FieldLabel htmlFor="seo-theme">Thématique</FieldLabel>
      <Input id="seo-theme" value={value.theme} onChange={e => set("theme", e.target.value)} placeholder="Montessori" required disabled={disabled} maxLength={200} /></Field>
    <SeoMarketFields value={value} onChange={onChange} disabled={disabled} />
    <Field data-disabled={disabled}><FieldLabel htmlFor="seo-scope">Offre et exclusions</FieldLabel>
      <Textarea id="seo-scope" value={value.scope} onChange={e => set("scope", e.target.value)} required disabled={disabled} maxLength={2000} rows={3} />
      <FieldDescription>Précise les produits à vendre et les sujets à écarter.</FieldDescription></Field>
    <Accordion type="multiple" value={accordionValue} onValueChange={onAccordionChange}>
      <AccordionItem value="competitors">
        <AccordionTrigger>Sites concurrents{value.competitors.length > 0 ? ` · ${value.competitors.length}` : " (facultatif)"}</AccordionTrigger>
        <AccordionContent>
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor="seo-competitors">URLs des concurrents</FieldLabel>
            <Textarea id="seo-competitors" defaultValue={value.competitors.join("\n")} onChange={e => set("competitors", e.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))}
              placeholder="Une URL HTTPS par ligne, jusqu’à 3 concurrents" disabled={disabled} rows={3} />
            <FieldDescription>Leurs menus servent de modèles pour organiser les collections, même dans une autre langue. Les mots-clés et volumes proviennent uniquement de ton Excel.</FieldDescription>
          </Field>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="priority">
        <AccordionTrigger>Critères de priorité</AccordionTrigger>
        <AccordionContent>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">Les collections sont d’abord retenues selon les produits à vendre. Leur volume principal dans l’Excel détermine ensuite la priorité : P1 au premier seuil, P2 au second, P3 en dessous ou sans volume. L’intention et le KD restent des indications.</p>
            <FieldGroup className="sm:flex-row sm:items-start">
              {([['p1Volume', 'Volume minimum P1'], ['p2Volume', 'Volume minimum P2']] as const).map(([key, label]) =>
                <Field key={key} data-disabled={disabled}>
                  <FieldLabel htmlFor={`seo-${key}`}>{label}</FieldLabel>
                  <Input id={`seo-${key}`} type="number" min={0} step={1}
                    value={value[key]} onChange={e => set(key, e.target.valueAsNumber)} required disabled={disabled} />
                </Field>)}
            </FieldGroup>
          </FieldGroup>
        </AccordionContent>
      </AccordionItem>
      {advancedSettings !== undefined && <AccordionItem value="advanced">
        <AccordionTrigger>Paramètres avancés</AccordionTrigger>
        <AccordionContent>{advancedSettings}</AccordionContent>
      </AccordionItem>}
    </Accordion>
  </FieldGroup>
}
