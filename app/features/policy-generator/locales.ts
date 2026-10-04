import en from "./templates/en/locale.json"
import de from "./templates/de/locale.json"
import es from "./templates/es/locale.json"
import it from "./templates/it/locale.json"
import nl from "./templates/nl/locale.json"
import { genericProductProfile, initialPolicyValues, shoeProductProfile, type PolicyFieldKey, type PolicyValues } from "./defaults"
import { policyFields } from "./fields"
import type { PolicyLanguage } from "./languages"

type LocalePack = typeof en
export const policyLocales: Record<PolicyLanguage, LocalePack> = {
  en, de, es, it, nl,
  fr: {
    locale: "fr-FR",
    labels: Object.fromEntries(policyFields.map((field) => [field.key, field.label])) as LocalePack["labels"],
    other: { returnResponseDelay: initialPolicyValues.returnResponseDelay, processingDelay: initialPolicyValues.processingDelay, shippingDelay: initialPolicyValues.shippingDelay, shippingCountry: initialPolicyValues.shippingCountry, supportDays: initialPolicyValues.supportDays },
    generic: genericProductProfile,
    shoes: shoeProductProfile,
    phrases: {
      missing: "Information à renseigner",
      returnAddress: "Les articles doivent être retournés à l’adresse suivante, après validation de votre demande par e-mail : <strong>{{returnAddress}}</strong>.",
      returnAddressPending: "Les articles doivent être retournés à l’adresse qui vous sera communiquée par e-mail après validation de votre demande de retour.",
      returnFeesShop: "Pour les retours liés à un changement d’avis, une erreur de choix, une variante ou une préférence personnelle, les frais de retour sont pris en charge par {{storeName}}.",
      returnFeesClient: "Pour les retours liés à un changement d’avis, une erreur de choix, une variante ou une préférence personnelle, les frais de retour sont à la charge du client.",
      returnLabelShop: "Dans ce cas, {{storeName}} fournit une étiquette de retour prépayée après validation de la demande. Le client suit les consignes transmises par notre service client pour effectuer son retour.",
      returnLabelClient: "Dans ce cas, l’étiquette de retour n’est pas prépayée par {{storeName}}. Le client est responsable du téléchargement, de l’impression et de l’achat de son étiquette de retour auprès du transporteur de son choix.",
      exchangeFeesShop: "Les frais de retour liés à un échange pour convenance personnelle sont pris en charge par {{storeName}}.",
      exchangeFeesClient: "Les frais de retour liés à un échange pour convenance personnelle sont à la charge du client.",
      shippingFree: "La livraison est offerte sur toutes les commandes livrées dans la zone suivante : {{shippingCountry}}.",
      shippingPaid: "Les frais de livraison sont de {{shippingFee}} pour les commandes livrées dans la zone suivante : {{shippingCountry}}.",
      creator: "Créateur du site", address: "Adresse", phone: "Tél.", email: "Mail",
    },
  },
}

export const localizedPolicyKeys = Object.keys({ ...en.other, ...en.generic }) as Array<keyof LocalePack["other"] | keyof LocalePack["generic"]>
export type LocalizedPolicyKey = typeof localizedPolicyKeys[number]
export type LocalizedPolicyValues = Pick<PolicyValues, LocalizedPolicyKey>
export type PolicyTextOverrides = Partial<Record<PolicyLanguage, Partial<LocalizedPolicyValues>>>

export function isLocalizedPolicyKey(key: PolicyFieldKey): key is LocalizedPolicyKey {
  return localizedPolicyKeys.some((candidate) => candidate === key)
}

export function getProductProfile(language: PolicyLanguage, profile: "generic" | "shoes") {
  const pack = policyLocales[language]
  return { ...pack.generic, ...(profile === "shoes" ? pack.shoes : {}) }
}

export function getLocalizedPolicyValues(shared: PolicyValues, language: PolicyLanguage, overrides: PolicyTextOverrides = {}): PolicyValues {
  const pack = policyLocales[language]
  return { ...shared, ...pack.other, ...pack.generic, ...overrides[language] }
}
