export type { Keyword, SeoConfig, SeoDocument, SeoNode, Assignment, SourceObservation } from "../../../convex/seo/model"
export { defaultConfig, MAX_KEYWORDS, intents, pageKinds, priorityFor, metricsFor } from "../../../convex/seo/model"
export const kindLabels = { home: "Accueil", collection: "Collection", group: "Regroupement de menu", product_need: "Besoin produit", guide: "Guide / article", filter: "Filtre" }
export const relevanceLabels = { relevant: "Pertinent", excluded: "Exclu", review: "À vérifier" }
export const statusLabels = { pending: "À valider", accepted: "Acceptée", rejected: "Rejetée" }
export const intentLabels = { I: "Informationnelle", C: "Commerciale", T: "Transactionnelle", N: "Navigationnelle", mixed: "Mixte", unknown: "Indéterminée" }
export const originLabels = { keywords: "Mots-clés de l’export", competitor: "Source concurrente", ai: "Hypothèse IA" }
