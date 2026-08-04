import { Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { ageGroupOptions, genderOptions } from "../constants"

export type RuleConditionDraft = {
  field: RuleField
  operator: RuleOperator
  value: string
  min: string
  max: string
}

export type RuleDraft = {
  name: string
  active: boolean
  priority: number
  target: "product" | "variant"
  attribute: "google_product_category" | "gender" | "age_group"
  conditionMode: "and" | "or"
  conditions: RuleConditionDraft[]
  value: string
  overwritePolicy: "only_if_empty" | "replace_existing"
}

type RuleField =
  | "product_title"
  | "product_type"
  | "vendor"
  | "tags"
  | "collections"
  | "variant_title"
  | "option_name"
  | "option_value"
  | "sku"
  | "current_attribute"

type RuleOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in"
  | "empty"
  | "not_empty"
  | "between"

const fields: Array<{ value: RuleField; label: string }> = [
  { value: "product_title", label: "Titre produit" },
  { value: "product_type", label: "Type produit" },
  { value: "vendor", label: "Vendeur" },
  { value: "tags", label: "Tags" },
  { value: "collections", label: "Collection" },
  { value: "variant_title", label: "Titre variante" },
  { value: "option_name", label: "Nom d’option" },
  { value: "option_value", label: "Valeur d’option" },
  { value: "sku", label: "SKU" },
  { value: "current_attribute", label: "Valeur Google actuelle" },
]

const operators: Array<{ value: RuleOperator; label: string }> = [
  { value: "equals", label: "est égal à" },
  { value: "not_equals", label: "n’est pas égal à" },
  { value: "contains", label: "contient" },
  { value: "not_contains", label: "ne contient pas" },
  { value: "starts_with", label: "commence par" },
  { value: "ends_with", label: "se termine par" },
  { value: "in", label: "appartient à la liste" },
  { value: "empty", label: "est vide" },
  { value: "not_empty", label: "n’est pas vide" },
  { value: "between", label: "est compris entre" },
]

export function emptyRuleDraft(): RuleDraft {
  return {
    name: "Nouvelle règle",
    active: false,
    priority: 10,
    target: "product",
    attribute: "gender",
    conditionMode: "and",
    conditions: [
      { field: "collections", operator: "contains", value: "", min: "", max: "" },
    ],
    value: "unisex",
    overwritePolicy: "only_if_empty",
  }
}

export function RuleBuilder({
  draft,
  saving,
  onChange,
  onSave,
}: {
  draft: RuleDraft
  saving: boolean
  onChange: (draft: RuleDraft) => void
  onSave: () => void
}) {
  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    onChange({ ...draft, [key]: value })
  const updateCondition = (index: number, patch: Partial<RuleConditionDraft>) =>
    update(
      "conditions",
      draft.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    )
  const setAttribute = (attribute: RuleDraft["attribute"]) => {
    const target = attribute === "age_group" ? "variant" : "product"
    const value =
      attribute === "age_group"
        ? "kids"
        : attribute === "gender"
          ? "unisex"
          : ""
    onChange({ ...draft, attribute, target, value })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field>
          <FieldLabel htmlFor="google-rule-name">Nom de la règle</FieldLabel>
          <Input id="google-rule-name" value={draft.name} onChange={(event) => update("name", event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="google-rule-priority">Priorité</FieldLabel>
          <Input id="google-rule-priority" type="number" min={0} value={draft.priority} onChange={(event) => update("priority", Number(event.target.value))} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm">
        <Checkbox checked={draft.active} onCheckedChange={(checked) => update("active", checked === true)} />
        Règle active
      </label>

      <div className="space-y-3 border-y py-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Si</span>
          <Select value={draft.conditionMode} onValueChange={(value) => update("conditionMode", value as RuleDraft["conditionMode"])}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="and">toutes les conditions</SelectItem>
                <SelectItem value="or">au moins une condition</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">correspondent :</span>
        </div>
        {draft.conditions.map((condition, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg bg-muted/45 p-3 xl:flex-row xl:items-center">
            <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">{index + 1}</span>
            <Select value={condition.field} onValueChange={(value) => updateCondition(index, { field: value as RuleField })}>
              <SelectTrigger className="xl:w-48"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {fields.map((field) => <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={condition.operator} onValueChange={(value) => updateCondition(index, { operator: value as RuleOperator })}>
              <SelectTrigger className="xl:w-52"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {operators.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            {condition.operator === "between" ? (
              <div className="flex flex-1 items-center gap-2">
                <Input aria-label="Minimum" type="number" value={condition.min} onChange={(event) => updateCondition(index, { min: event.target.value })} />
                <span className="text-sm text-muted-foreground">et</span>
                <Input aria-label="Maximum" type="number" value={condition.max} onChange={(event) => updateCondition(index, { max: event.target.value })} />
              </div>
            ) : condition.operator === "empty" || condition.operator === "not_empty" ? (
              <span className="flex-1 text-sm text-muted-foreground">Aucune valeur nécessaire</span>
            ) : (
              <Input className="flex-1" aria-label="Valeur de condition" placeholder={condition.operator === "in" ? "Valeurs séparées par des virgules" : "Valeur"} value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} />
            )}
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer la condition" disabled={draft.conditions.length === 1} onClick={() => update("conditions", draft.conditions.filter((_, conditionIndex) => conditionIndex !== index))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={draft.conditions.length >= 10} onClick={() => update("conditions", [...draft.conditions, { field: draft.target === "variant" ? "option_value" : "product_title", operator: "contains", value: "", min: "", max: "" }])}>
          <Plus data-icon="inline-start" />
          Ajouter une condition
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4 xl:flex-row xl:items-center">
        <span className="shrink-0 text-sm font-medium">Alors définir</span>
        <Select value={draft.attribute} onValueChange={(value) => setAttribute(value as RuleDraft["attribute"])}>
          <SelectTrigger className="xl:w-56"><SelectValue /></SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectItem value="google_product_category">Catégorie Google</SelectItem>
              <SelectItem value="gender">Genre</SelectItem>
              <SelectItem value="age_group">Tranche d’âge</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">sur</span>
        <RuleValueControl draft={draft} onValue={(value) => update("value", value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Politique d’écrasement</FieldLabel>
          <Select value={draft.overwritePolicy} onValueChange={(value) => update("overwritePolicy", value as RuleDraft["overwritePolicy"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="only_if_empty">Seulement si vide</SelectItem>
                <SelectItem value="replace_existing">Remplacer l’existant</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end justify-end">
          <Button type="button" disabled={saving} onClick={onSave}>
            <Save data-icon="inline-start" />
            {saving ? "Enregistrement…" : "Enregistrer la règle"}
          </Button>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Les propositions manuelles restent protégées. Enregistrer cette règle ne publie rien dans Shopify.
      </p>
    </div>
  )
}

function RuleValueControl({ draft, onValue }: { draft: RuleDraft; onValue: (value: string) => void }) {
  if (draft.attribute === "gender") {
    return (
      <Select value={draft.value} onValueChange={onValue}>
        <SelectTrigger className="xl:w-48"><SelectValue /></SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {genderOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }
  if (draft.attribute === "age_group") {
    return (
      <Select value={draft.value} onValueChange={onValue}>
        <SelectTrigger className="xl:w-48"><SelectValue /></SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {ageGroupOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }
  return <Input className="xl:max-w-xs" value={draft.value} onChange={(event) => onValue(event.target.value)} placeholder="ID de catégorie Google" />
}
