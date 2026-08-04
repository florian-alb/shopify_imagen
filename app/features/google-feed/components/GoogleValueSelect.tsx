import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function GoogleValueSelect({
  value,
  options,
  disabled = false,
  label,
  onChange,
}: {
  value: string | null
  options: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
  label: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value ?? ""} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="min-w-32">
        <SelectValue placeholder="Non renseigné" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
