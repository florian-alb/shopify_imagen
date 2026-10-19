import type { SeoConfig } from "../types"
import { europeanLanguages } from "../../../lib/languages"

export const seoLanguages = europeanLanguages

export const seoCountries = [
  { code: "DE", label: "Allemagne", flag: "🇩🇪", language: "de", aliases: ["germany", "deutschland"] },
  { code: "AT", label: "Autriche", flag: "🇦🇹", language: "de", aliases: ["austria", "österreich"] },
  { code: "BE", label: "Belgique", flag: "🇧🇪", language: "fr", aliases: ["belgium", "belgië"] },
  { code: "CA", label: "Canada", flag: "🇨🇦", language: "en", aliases: [] },
  { code: "ES", label: "Espagne", flag: "🇪🇸", language: "es", aliases: ["spain", "españa"] },
  { code: "US", label: "États-Unis", flag: "🇺🇸", language: "en", aliases: ["usa", "united states", "etats unis"] },
  { code: "FR", label: "France", flag: "🇫🇷", language: "fr", aliases: [] },
  { code: "IE", label: "Irlande", flag: "🇮🇪", language: "en", aliases: ["ireland"] },
  { code: "IT", label: "Italie", flag: "🇮🇹", language: "it", aliases: ["italy", "italia"] },
  { code: "LU", label: "Luxembourg", flag: "🇱🇺", language: "fr", aliases: [] },
  { code: "NL", label: "Pays-Bas", flag: "🇳🇱", language: "nl", aliases: ["netherlands", "nederland"] },
  { code: "GB", label: "Royaume-Uni", flag: "🇬🇧", language: "en", aliases: ["uk", "united kingdom"] },
  { code: "CH", label: "Suisse", flag: "🇨🇭", language: "fr", aliases: ["switzerland", "schweiz"] },
] as const

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function findSeoCountry(value: string) {
  const key = normalize(value)
  return seoCountries.find(country => [country.code, country.label, ...country.aliases].some(alias => normalize(alias) === key))
}

export function findSeoLanguage(value: string) {
  const key = normalize(value)
  return seoLanguages.find(language => [language.code, language.label, ...language.aliases].some(alias => normalize(alias) === key))
}

export function resolveSeoMarket(config: SeoConfig) {
  const sourceCountry = findSeoCountry(config.sourceCountry)?.label ?? config.sourceCountry.trim()
  const targetCountry = findSeoCountry(config.targetCountry)?.label ?? config.targetCountry.trim()
  const sourceLanguage = findSeoLanguage(config.sourceLanguage)?.code ?? config.sourceLanguage.trim()
  const targetLanguage = findSeoLanguage(config.targetLanguage)?.code ?? config.targetLanguage.trim()
  const countryConflict = normalize(sourceCountry) !== normalize(targetCountry)
  const languageConflict = normalize(sourceLanguage) !== normalize(targetLanguage)
  return {
    country: countryConflict ? "" : sourceCountry,
    language: languageConflict ? "" : sourceLanguage,
    countryConflict,
    languageConflict,
  }
}

export function applySeoMarketCountry(config: SeoConfig, code: string): SeoConfig {
  const country = seoCountries.find(country => country.code === code)
  if (!country) return config
  return { ...config, sourceCountry: country.label, targetCountry: country.label, sourceLanguage: country.language, targetLanguage: country.language }
}

export function applySeoMarketLanguage(config: SeoConfig, code: string): SeoConfig {
  const market = resolveSeoMarket(config)
  const language = seoLanguages.find(language => language.code === code)
  if (market.countryConflict || !language) return config
  return { ...config, sourceCountry: market.country, targetCountry: market.country, sourceLanguage: code, targetLanguage: code }
}
