import { useId } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { LanguageSelect } from "@/components/ui/language-select"
import { getLanguageOptions } from "@/lib/languages"
import { tagLanguages, type TagLanguage } from "../../../../convex/catalogue/tags"

const options = getLanguageOptions(tagLanguages.map((language) => language.value))

export function TagLanguageSelect({ value, onChange, disabled = false }: {
  value: TagLanguage
  onChange: (value: TagLanguage) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field className="w-full sm:w-56" data-disabled={disabled}>
      <FieldLabel htmlFor={id}>Langue des tags</FieldLabel>
      <LanguageSelect
        id={id}
        value={value}
        options={options}
        disabled={disabled}
        onValueChange={onChange}
      />
    </Field>
  )
}
