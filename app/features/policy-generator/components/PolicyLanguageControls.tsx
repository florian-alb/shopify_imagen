import { policyLanguages, type PolicyLanguage } from "../languages"

type PolicyLanguageControlsProps = {
  language: PolicyLanguage
  onLanguage: (language: PolicyLanguage) => void
}

export function PolicyLanguageControls({ language, onLanguage }: PolicyLanguageControlsProps) {
  return (
    <select aria-label="Langue des politiques" value={language} onChange={(event) => onLanguage(event.target.value as PolicyLanguage)} className="h-9 rounded-md border bg-background px-3 text-sm">
      {policyLanguages.map((item) => <option key={item.code} value={item.code}>{item.flag} {item.label}</option>)}
    </select>
  )
}
