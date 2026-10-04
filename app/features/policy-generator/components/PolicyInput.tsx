import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PolicyField } from "../fields"
import type { PolicyFieldKey } from "../defaults"

type PolicyInputProps = {
  field: PolicyField
  value: string
  error?: string
  onChange: (key: PolicyFieldKey, value: string) => void
}

export function PolicyInput({ field, value, error, onChange }: PolicyInputProps) {
  const id = `policy-${field.key}`
  const describedBy = [field.hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined
  const shared = { id, value, "aria-invalid": Boolean(error), "aria-describedby": describedBy, required: !field.optional }
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {field.optional && <span className="font-normal text-muted-foreground">(facultatif)</span>}
      </FieldLabel>
      {field.type === "textarea" ? (
        <Textarea {...shared} rows={field.key === "address" || field.key.endsWith("Address") ? 3 : 5} onChange={(event) => onChange(field.key, event.target.value)} />
      ) : field.type === "select" ? (
        <Select value={value} onValueChange={(next) => onChange(field.key, next)}>
          <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)} aria-describedby={describedBy}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="client">À la charge du client</SelectItem><SelectItem value="boutique">Pris en charge par la boutique</SelectItem></SelectContent>
        </Select>
      ) : (
        <Input {...shared} type={field.type ?? "text"} placeholder={field.placeholder} min={field.min} max={field.max} step={field.key === "shippingFee" ? "0.01" : undefined} onChange={(event) => onChange(field.key, event.target.value)} />
      )}
      {field.hint && <FieldDescription id={`${id}-hint`}>{field.hint}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
