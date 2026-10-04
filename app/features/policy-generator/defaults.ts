import shoeProfile from "./templates/shoe-profile.json"

export const genericProductProfile = {
  productDescription: "nos articles",
  returnConditions: "non utilisé au-delà d’un simple essai ;\npropre, non taché et non endommagé ;\ncomplet, avec ses accessoires éventuels ;\nretourné dans son emballage d’origine et dans un emballage protecteur adapté.",
  packingInstructions: "indiquer votre numéro de commande à l’intérieur du colis ;\nretourner l’article avec ses accessoires et son emballage d’origine lorsque celui-ci est disponible ;\nutiliser un emballage protecteur adapté ;\nne pas coller directement l’étiquette de transport sur l’emballage d’origine ;\nnous transmettre une preuve d’expédition par e-mail, comme un récépissé de dépôt ou un numéro de suivi.",
  returnSummary: "Les articles retournés incomplets, abîmés, tachés ou dans un état ne permettant pas leur remise en vente pourront faire l’objet d’un refus de retour ou d’un remboursement partiel.",
  rejectionReasons: "utilisé de manière excessive ;\ntaché ou endommagé ;\nincomplet ou sans les accessoires fournis ;\nsans protection suffisante lors du transport retour ;\ndans un état ne permettant pas sa remise en vente.",
  excludedProducts: "les cartes cadeaux ;\nles articles confectionnés sur mesure ;\nles articles nettement personnalisés selon vos demandes ;\nles articles modifiés spécialement pour vous ;\nles articles retournés dans un état ne permettant pas leur remise en vente.",
  exchangeOptions: "une taille différente ;\nune couleur différente ;\nle même article dans une autre variante disponible.",
  returnTransport: shoeProfile.returnTransport,
}

export const shoeProductProfile = {
  ...shoeProfile,
  productDescription: "les mocassins, chaussures et accessoires",
}

export const initialPolicyValues = {
  storeName: "", websiteUrl: "", operatorName: "", publisherName: "",
  legalStatus: "", siret: "", address: "", email: "", phone: "",
  creatorName: "", creatorAddress: "", creatorEmail: "", creatorPhone: "",
  hostAddress: "151 O'Connor Street, Ground Floor\nK2P 2L8 Ottawa\nCanada",
  hostPhone: "+1 613 241-2828",
  updatedAt: "", returnDays: "30", returnFeePayer: "client", returnAddress: "",
  returnResponseDelay: "24 à 48 heures ouvrées",
  processingDelay: "1 à 3 jours ouvrés", shippingDelay: "6 à 9 jours ouvrés",
  shippingCountry: "France", shippingFee: "0", trackingHours: "24",
  supportDays: "du lundi au vendredi", supportStart: "09:00", supportEnd: "18:00",
  supportResponseHours: "24", contactPath: "/pages/contact",
  refundPath: "/policies/refund-policy", privacyPath: "/policies/privacy-policy",
  ...genericProductProfile,
}

export type PolicyValues = { [Key in keyof typeof initialPolicyValues]: string }
export type PolicyFieldKey = keyof PolicyValues
export type PolicyErrors = Partial<Record<PolicyFieldKey, string>>

export function getPolicyDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date())
}
