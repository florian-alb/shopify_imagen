import type { ComponentProps } from "react"
import type { LanguageOption } from "@/lib/languages"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type LanguageSelectProps<Code extends string> = Omit<
  ComponentProps<typeof SelectTrigger>,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  value: string
  onValueChange: (value: Code) => void
  options: readonly LanguageOption<Code>[]
  placeholder?: string
  required?: boolean
}

export function LanguageSelect<Code extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Sélectionner la langue",
  disabled,
  required,
  name,
  form,
  className,
  ...triggerProps
}: LanguageSelectProps<Code>) {
  return (
    <Select
      value={value}
      onValueChange={(code) => {
        const option = options.find((item) => item.code === code)
        if (option) onValueChange(option.code)
      }}
      disabled={disabled}
      required={required}
      name={name}
      form={form}
    >
      <SelectTrigger className={cn("w-full", className)} {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {value && !options.some((option) => option.code === value) && (
            <SelectItem value={value} textValue={value}>{value}</SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.code} value={option.code} textValue={option.label}>
              <span aria-hidden="true">{option.flag}</span>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
