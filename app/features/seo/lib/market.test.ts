import { describe, expect, test } from "vitest"
import { defaultConfig } from "../types"
import { applySeoMarketCountry, applySeoMarketLanguage, resolveSeoMarket } from "./market"

describe("marché SEO commun", () => {
  test("un choix de pays synchronise les deux marchés et propose sa langue", () => {
    const result = applySeoMarketCountry({ ...defaultConfig, theme: "Montessori" }, "DE")
    expect(result).toMatchObject({ theme: "Montessori", sourceCountry: "Allemagne", targetCountry: "Allemagne", sourceLanguage: "de", targetLanguage: "de" })
  })

  test("la langue peut être adaptée pour un pays multilingue", () => {
    const belgium = applySeoMarketCountry(defaultConfig, "BE")
    expect(applySeoMarketLanguage(belgium, "nl")).toMatchObject({ sourceCountry: "Belgique", targetCountry: "Belgique", sourceLanguage: "nl", targetLanguage: "nl" })
  })

  test("reconnaît les anciennes valeurs équivalentes sans créer de conflit", () => {
    const legacy = { ...defaultConfig, sourceCountry: "de", targetCountry: "Allemagne", sourceLanguage: "Deutsch", targetLanguage: "de" }
    expect(resolveSeoMarket(legacy)).toEqual({ country: "Allemagne", language: "de", countryConflict: false, languageConflict: false })
  })

  test("les marchés historiques divergents restent explicites jusqu’au choix du pays", () => {
    const legacy = { ...defaultConfig, sourceCountry: "Allemagne", targetCountry: "France", sourceLanguage: "de", targetLanguage: "fr" }
    expect(resolveSeoMarket(legacy)).toEqual({ country: "", language: "", countryConflict: true, languageConflict: true })
    expect(applySeoMarketLanguage(legacy, "en")).toBe(legacy)
    expect(applySeoMarketCountry(legacy, "FR")).toMatchObject({ sourceCountry: "France", targetCountry: "France", sourceLanguage: "fr", targetLanguage: "fr" })
  })

  test("conserve un marché historique absent des choix et refuse un nouveau code inconnu", () => {
    const legacy = { ...defaultConfig, sourceCountry: "Australie", targetCountry: "Australie", sourceLanguage: "en", targetLanguage: "en" }
    expect(resolveSeoMarket(legacy).country).toBe("Australie")
    expect(applySeoMarketCountry(legacy, "inconnu")).toBe(legacy)
  })

  test("une divergence de langue seule attend un choix explicite et garde le pays", () => {
    const legacy = { ...defaultConfig, sourceCountry: "Belgique", targetCountry: "Belgique", sourceLanguage: "nl", targetLanguage: "fr" }
    expect(resolveSeoMarket(legacy)).toEqual({ country: "Belgique", language: "", countryConflict: false, languageConflict: true })
    expect(applySeoMarketLanguage(legacy, "fr")).toMatchObject({ sourceCountry: "Belgique", targetCountry: "Belgique", sourceLanguage: "fr", targetLanguage: "fr" })
    expect(applySeoMarketLanguage(legacy, "inconnue")).toBe(legacy)
  })
})
