import type { PolicyErrors, PolicyValues } from "../defaults"
import { policyFields } from "../fields"

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

export function isPolicyLink(value: string): boolean {
  return (/^\/(?!\/)/.test(value) && !/[\\\s<>"']/u.test(value)) || isHttpsUrl(value)
}

export function validatePolicyValues(values: PolicyValues): PolicyErrors {
  const errors: PolicyErrors = {}
  for (const field of policyFields) {
    const value = values[field.key].trim()
    if (!value) {
      if (!field.optional) errors[field.key] = "Ce champ est requis."
      continue
    }
    if (field.type === "email" && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(value)) {
      errors[field.key] = "Renseignez une adresse e-mail valide."
    }
    if (field.type === "tel" && !/^\+?[\d\s().-]{6,}$/.test(value)) {
      errors[field.key] = "Renseignez un numéro de téléphone valide."
    }
    if (field.type === "number") {
      const number = Number(value)
      if (!Number.isFinite(number) || number < (field.min ?? 0) || number > (field.max ?? Infinity) || (field.key !== "shippingFee" && !Number.isInteger(number))) {
        errors[field.key] = field.key === "shippingFee" ? "Renseignez un montant positif ou nul." : `Renseignez un nombre entier entre ${field.min ?? 0} et ${field.max}.`
      }
      if (field.key === "shippingFee" && !/^\d+(?:\.\d{1,2})?$/.test(value)) errors.shippingFee = "Renseignez un montant positif ou nul avec au plus deux décimales."
    }
  }
  if (values.websiteUrl.trim() && !isHttpsUrl(values.websiteUrl.trim())) errors.websiteUrl = "Renseignez une adresse HTTPS valide."
  if (values.siret.trim() && !/^\d{14}$/.test(values.siret.replace(/\s/g, ""))) errors.siret = "Le SIRET doit contenir 14 chiffres."
  if (values.updatedAt) {
    const date = new Date(`${values.updatedAt}T12:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.updatedAt) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.updatedAt) errors.updatedAt = "Renseignez une date valide."
  }
  for (const key of ["contactPath", "refundPath", "privacyPath"] as const) {
    if (values[key].trim() && !isPolicyLink(values[key].trim())) errors[key] = "Utilisez un chemin commençant par / ou une adresse HTTPS."
  }
  for (const key of ["supportStart", "supportEnd"] as const) {
    if (values[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values[key])) errors[key] = "Renseignez une heure valide."
  }
  if (values.supportStart && values.supportEnd && values.supportEnd <= values.supportStart) errors.supportEnd = "La fermeture doit être après l’ouverture."
  if (!["client", "boutique"].includes(values.returnFeePayer)) errors.returnFeePayer = "Choisissez qui prend en charge les frais."
  return errors
}
