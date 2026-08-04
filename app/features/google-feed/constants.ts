export type GoogleFeedAttribute =
  | "google_product_category"
  | "gender"
  | "age_group"

export const genderOptions = [
  { value: "male", label: "Homme" },
  { value: "female", label: "Femme" },
  { value: "unisex", label: "Unisexe" },
] as const

export const ageGroupOptions = [
  { value: "newborn", label: "Nouveau-né" },
  { value: "infant", label: "Nourrisson" },
  { value: "toddler", label: "Tout-petit" },
  { value: "kids", label: "Enfant" },
  { value: "adult", label: "Adulte" },
] as const

export const attributeLabels: Record<GoogleFeedAttribute, string> = {
  google_product_category: "Catégorie Google",
  gender: "Genre",
  age_group: "Tranche d’âge",
}

export const statusLabels = {
  draft: "Prêt à publier",
  conflict: "Conflit entre règles",
  invalid: "Valeur invalide",
  publishing: "Publication…",
  confirmed: "Confirmé",
  failed: "À relancer",
} as const
