import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { policyFieldGroups } from "../fields"
import type { PolicyErrors, PolicyFieldKey, PolicyValues } from "../defaults"
import { PolicyInput } from "./PolicyInput"

type PolicyFormProps = {
  values: PolicyValues
  errors: PolicyErrors
  showErrors: boolean
  onChange: (key: PolicyFieldKey, value: string) => void
  onValidate: () => void
  onProfile: (profile: "generic" | "shoes") => void
}

export function PolicyForm({ values, errors, showErrors, onChange, onValidate, onProfile }: PolicyFormProps) {
  const [openGroups, setOpenGroups] = useState([policyFieldGroups[0].title])
  const invalidGroups = showErrors ? policyFieldGroups.filter((group) => group.fields.some((field) => errors[field.key])).map((group) => group.title) : []
  const expandedGroups = [...new Set([...openGroups, ...invalidGroups])]
  return (
    <form noValidate autoComplete="off" onSubmit={(event) => { event.preventDefault(); onValidate() }} className="min-w-0 rounded-lg border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Informations du site</h2>
      </div>
      <Accordion type="multiple" value={expandedGroups} onValueChange={setOpenGroups}>
        {policyFieldGroups.map((group, index) => {
          const errorCount = showErrors ? group.fields.filter((field) => errors[field.key]).length : 0
          return (
            <AccordionItem key={group.title} value={group.title} className="px-5">
              <AccordionTrigger className="py-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">0{index + 1}</span>
                  {group.title}
                  {errorCount > 0 && <span className="text-xs text-destructive">{errorCount} à compléter</span>}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pb-5">
                {index === 1 && (
                  <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onProfile("generic")}>Articles génériques</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onProfile("shoes")}>Chaussures</Button>
                  </div>
                )}
                {group.fields.map((field) => <PolicyInput key={field.key} field={field} value={values[field.key]} error={showErrors ? errors[field.key] : undefined} onChange={onChange} />)}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
      <div className="border-t px-5 py-4"><Button type="submit" variant="outline" className="w-full">Vérifier les informations</Button></div>
    </form>
  )
}
