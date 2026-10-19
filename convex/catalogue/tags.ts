import { v } from "convex/values"

export const tagLanguages = [
  { value: "en", label: "Anglais" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Allemand" },
  { value: "es", label: "Espagnol" },
  { value: "it", label: "Italien" },
  { value: "pt", label: "Portugais" },
  { value: "nl", label: "Néerlandais" },
  { value: "pl", label: "Polonais" },
  { value: "ar", label: "Arabe" },
  { value: "ja", label: "Japonais" },
  { value: "zh", label: "Chinois" },
] as const
export type TagLanguage = (typeof tagLanguages)[number]["value"]
export const tagLanguageValidator = v.union(
  v.literal("en"), v.literal("fr"), v.literal("de"), v.literal("es"),
  v.literal("it"), v.literal("pt"), v.literal("nl"), v.literal("pl"),
  v.literal("ar"), v.literal("ja"), v.literal("zh"),
)
export const normalizeTag = (tag: string) => tag.normalize("NFC").trim()
export function validCollectionTag(value: string) {
  const tag = normalizeTag(value)
  return tag.length <= 100 && tag === tag.toLowerCase() &&
    /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[ -][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u.test(tag)
}
