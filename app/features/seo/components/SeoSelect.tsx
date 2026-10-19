import { useId } from "react"
import { Field, FieldLabel } from "@/components/ui/field"

export function SeoSelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Array<{ value: string; label: string; disabled?: boolean }>; onChange: (value: string) => void; disabled?: boolean
}) {
  const id = useId()
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
    {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
  </select></Field>
}
