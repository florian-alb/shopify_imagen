import { LanguageSelect } from "@/components/ui/language-select"
import { policyLanguages, type PolicyLanguage } from "../languages"

type PolicyLanguageControlsProps = {
  language: PolicyLanguage
  onLanguage: (language: PolicyLanguage) => void
}

export function PolicyLanguageControls({ language, onLanguage }: PolicyLanguageControlsProps) {
  return (
    <LanguageSelect
      aria-label="Langue des politiques"
      value={language}
      onValueChange={onLanguage}
      options={policyLanguages}
    />
  )
}
