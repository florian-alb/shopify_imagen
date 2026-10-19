export type LanguageOption<Code extends string = string> = {
  code: Code
  label: string
  flag: string
}

const languageDetails = {
  fr: { label: "Français", native: "Français", flag: "🇫🇷", aliases: ["french"] },
  en: { label: "Anglais", native: "English", flag: "🇬🇧", aliases: ["english"] },
  de: { label: "Allemand", native: "Deutsch", flag: "🇩🇪", aliases: ["german", "deutsch"] },
  es: { label: "Espagnol", native: "Español", flag: "🇪🇸", aliases: ["spanish", "español"] },
  it: { label: "Italien", native: "Italiano", flag: "🇮🇹", aliases: ["italian", "italiano"] },
  nl: { label: "Néerlandais", native: "Nederlands", flag: "🇳🇱", aliases: ["dutch", "nederlands"] },
  pt: { label: "Portugais", native: "Português", flag: "🇵🇹", aliases: ["portuguese"] },
  pl: { label: "Polonais", native: "Polski", flag: "🇵🇱", aliases: ["polish"] },
  ar: { label: "Arabe", native: "العربية", flag: "🇸🇦", aliases: ["arabic"] },
  ja: { label: "Japonais", native: "日本語", flag: "🇯🇵", aliases: ["japanese"] },
  zh: { label: "Chinois", native: "中文", flag: "🇨🇳", aliases: ["chinese"] },
} as const

export type LanguageCode = keyof typeof languageDetails
const languageOrder = Object.keys(languageDetails)

export function getLanguageOptions<Code extends LanguageCode>(codes: readonly Code[]) {
  return codes
    .map((code) => ({ code, ...languageDetails[code] }))
    .sort((a, b) => languageOrder.indexOf(a.code) - languageOrder.indexOf(b.code))
}

export const europeanLanguages = getLanguageOptions(["fr", "en", "de", "es", "it", "nl"])
