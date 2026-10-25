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

// Retain the string field so existing single-tag catalogues need no migration.
export const parseCollectionTags = (value: string) => value.split(",").map(normalizeTag)
export const normalizeCollectionTags = (value: string) => parseCollectionTags(value).join(", ")
export const collectionTagKey = (value: string) => JSON.stringify(parseCollectionTags(value).sort())

export function collectionTagsError(value: string): string | null {
  const values = parseCollectionTags(value)
  if (!value.trim()) return "Saisissez au moins un tag."
  if (values.length > 60) return "60 tags maximum par collection."
  if (values.some((tag) => !validCollectionTag(tag)))
    return "Séparez les tags par des virgules ; chaque tag doit être non vide, en minuscules et limité à 100 caractères (accents, chiffres, espaces et tirets acceptés)."
  if (new Set(values).size !== values.length)
    return "Un même tag ne peut apparaître qu’une fois dans cette collection."
  return null
}
