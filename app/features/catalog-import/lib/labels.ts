export const statusLabels: Record<string, string> = {
  queued: "En attente",
  running: "En cours",
  selecting: "Collections à choisir",
  review: "Prêt à vérifier",
  paused: "En pause",
  interrupted: "Interrompu",
  completed: "Terminé",
  partial: "Terminé avec erreurs",
  cancelled: "Annulé",
}
export const phaseLabels: Record<string, string> = {
  discover: "Préparation des collections",
  menu: "Lecture du menu",
  collection: "Découverte des produits",
  sitemap: "Lecture du sitemap",
  index: "Déduplication",
  products: "Collecte des fiches",
  assemble: "Assemblage de l’export",
  importSetup: "Création des collections",
  importProducts: "Import des produits",
  importLinks: "Vérification des liens internes",
  importFinish: "Création du menu",
}
export const number = (n: number) => new Intl.NumberFormat("fr-FR").format(n)
