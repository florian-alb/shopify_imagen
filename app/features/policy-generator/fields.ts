import type { PolicyFieldKey } from "./defaults"

export type PolicyField = {
  key: PolicyFieldKey
  label: string
  type?: "email" | "url" | "tel" | "date" | "time" | "number" | "textarea" | "select"
  placeholder?: string
  hint?: string
  optional?: boolean
  min?: number
  max?: number
}
export type PolicyFieldGroup = { title: string; description: string; fields: PolicyField[] }

export const policyFieldGroups: PolicyFieldGroup[] = [
  {
    title: "Boutique et entreprise",
    description: "Ces informations sont reprises dans les six documents.",
    fields: [
      { key: "storeName", label: "Nom du site", placeholder: "Nom de votre boutique" },
      { key: "websiteUrl", label: "Adresse du site", type: "url", placeholder: "https://votre-boutique.fr" },
      { key: "operatorName", label: "Éditeur / raison sociale" },
      { key: "publisherName", label: "Responsable de la publication", optional: true, hint: "À défaut, reprend le nom de l’éditeur." },
      { key: "legalStatus", label: "Statut juridique", placeholder: "Micro-entreprise, SAS, SARL…" },
      { key: "siret", label: "SIRET", placeholder: "14 chiffres" },
      { key: "address", label: "Adresse du siège social", type: "textarea" },
      { key: "email", label: "E-mail de contact", type: "email" },
      { key: "phone", label: "Téléphone", type: "tel", placeholder: "+33 …" },
      { key: "updatedAt", label: "Date de mise à jour", type: "date" },
    ],
  },
  {
    title: "Retours et produits",
    description: "L’extension commerciale et les passages propres à vos produits. Les délais légaux du modèle restent fixes.",
    fields: [
      { key: "productDescription", label: "Produits vendus", placeholder: "les rideaux et accessoires" },
      { key: "returnDays", label: "Délai commercial de retour et d’échange (jours)", type: "number", min: 15, max: 365, hint: "Ce modèle prévoit une extension au-delà des 14 jours de rétractation." },
      { key: "returnFeePayer", label: "Frais de retour pour changement d’avis", type: "select" },
      { key: "returnAddress", label: "Adresse de retour", type: "textarea", optional: true, hint: "Si vide, l’adresse sera communiquée par e-mail après validation." },
      { key: "returnResponseDelay", label: "Délai de traitement des demandes de retour" },
      { key: "returnConditions", label: "Conditions de l’extension commerciale", type: "textarea", hint: "Une condition par ligne." },
      { key: "packingInstructions", label: "Consignes d’emballage du retour", type: "textarea", hint: "Une consigne par ligne." },
      { key: "returnSummary", label: "Résumé des retours pouvant être refusés", type: "textarea" },
      { key: "rejectionReasons", label: "Motifs de remboursement partiel ou de refus", type: "textarea", hint: "Un motif par ligne." },
      { key: "excludedProducts", label: "Produits exclus selon votre modèle", type: "textarea", hint: "Un produit ou une catégorie par ligne." },
      { key: "exchangeOptions", label: "Variantes disponibles pour les échanges", type: "textarea", hint: "Une possibilité par ligne." },
      { key: "returnTransport", label: "Responsabilité pendant le transport retour", type: "textarea" },
    ],
  },
  {
    title: "Livraison",
    description: "Une zone de livraison, comme dans le modèle fourni. Les délais sont exprimés avec leur unité.",
    fields: [
      { key: "processingDelay", label: "Délai de préparation", placeholder: "1 à 3 jours ouvrés" },
      { key: "shippingDelay", label: "Délai d’acheminement", placeholder: "6 à 9 jours ouvrés" },
      { key: "shippingCountry", label: "Pays / zone de livraison" },
      { key: "shippingFee", label: "Frais de livraison (€)", type: "number", min: 0, hint: "0 pour une livraison offerte." },
      { key: "trackingHours", label: "Envoi du suivi après expédition (heures)", type: "number", min: 1, max: 720 },
    ],
  },
  {
    title: "Service client",
    description: "Disponibilité et délai de réponse indiqués sur la page de contact.",
    fields: [
      { key: "supportDays", label: "Jours d’ouverture", placeholder: "du lundi au vendredi" },
      { key: "supportStart", label: "Heure d’ouverture", type: "time" },
      { key: "supportEnd", label: "Heure de fermeture", type: "time" },
      { key: "supportResponseHours", label: "Délai de réponse (heures ouvrées)", type: "number", min: 1, max: 720 },
    ],
  },
  {
    title: "Création et hébergement",
    description: "Le modèle utilise Shopify. Les champs du créateur laissés vides reprennent les coordonnées de l’éditeur.",
    fields: [
      { key: "creatorName", label: "Créateur du site", optional: true },
      { key: "creatorAddress", label: "Adresse du créateur", type: "textarea", optional: true },
      { key: "creatorEmail", label: "E-mail du créateur", type: "email", optional: true },
      { key: "creatorPhone", label: "Téléphone du créateur", type: "tel", optional: true },
      { key: "hostAddress", label: "Adresse de l’hébergeur Shopify", type: "textarea" },
      { key: "hostPhone", label: "Téléphone de l’hébergeur", type: "tel" },
    ],
  },
  {
    title: "Liens des pages",
    description: "Chemins sur votre site ou adresses HTTPS complètes.",
    fields: [
      { key: "contactPath", label: "Page de contact" },
      { key: "refundPath", label: "Politique de retour" },
      { key: "privacyPath", label: "Politique de confidentialité" },
    ],
  },
]

export const policyFields = policyFieldGroups.flatMap((group) => group.fields)
