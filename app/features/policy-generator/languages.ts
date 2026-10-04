export const policyLanguages = [
  { code: "fr", label: "Français", native: "Français", flag: "🇫🇷" },
  { code: "en", label: "Anglais", native: "English", flag: "🇬🇧" },
  { code: "de", label: "Allemand", native: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Espagnol", native: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italien", native: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Néerlandais", native: "Nederlands", flag: "🇳🇱" },
] as const

export type PolicyLanguage = typeof policyLanguages[number]["code"]
export type TranslationLanguage = Exclude<PolicyLanguage, "fr">

export const policyDocumentTitles: Record<PolicyLanguage, { bundle: string; policies: string[] }> = {
  fr: { bundle: "Politiques du site", policies: ["Retours et remboursements", "Confidentialité", "Livraison", "Contact", "Mentions légales", "CGV et CGU"] },
  en: { bundle: "Website policies", policies: ["Returns and refunds", "Privacy policy", "Shipping policy", "Contact information", "Legal notice", "Terms of sale and use"] },
  de: { bundle: "Richtlinien der Website", policies: ["Rückgabe und Erstattung", "Datenschutzerklärung", "Versandrichtlinie", "Kontaktinformationen", "Rechtliche Hinweise", "Verkaufs- und Nutzungsbedingungen"] },
  es: { bundle: "Políticas del sitio web", policies: ["Devoluciones y reembolsos", "Política de privacidad", "Política de envío", "Información de contacto", "Aviso legal", "Condiciones de venta y uso"] },
  it: { bundle: "Politiche del sito web", policies: ["Resi e rimborsi", "Informativa sulla privacy", "Politica di spedizione", "Informazioni di contatto", "Note legali", "Condizioni di vendita e utilizzo"] },
  nl: { bundle: "Websitebeleid", policies: ["Retourneren en terugbetalingen", "Privacybeleid", "Verzendbeleid", "Contactgegevens", "Juridische informatie", "Verkoop- en gebruiksvoorwaarden"] },
}

export function getPolicyLanguageLabel(language: PolicyLanguage): string {
  return policyLanguages.find((option) => option.code === language)!.label
}
