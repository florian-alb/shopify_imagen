import { Boxes, FileText, FolderInput, ImageIcon, Layers3, ListChecks, Tags, Network, Settings2 } from "lucide-react";

export const navGroups = [
  {
    label: "Studio",
    items: [
      { to: "/products", label: "Produits", icon: Boxes },
      { to: "/jobs", label: "Générations", icon: ListChecks },
      { to: "/bulk-operations", label: "Opérations groupées", icon: Layers3 },
    ],
  },
  {
    label: "Catalogue",
    items: [{ to: "/catalog-import", label: "Imports", icon: FolderInput }],
  },
  {
    label: "Visibilité",
    items: [
      { to: "/google-feed", label: "Flux Google", icon: Tags },
      { to: "/seo", label: "Arborescence SEO", icon: Network },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/settings/prompts", label: "Modèles d’images", icon: ImageIcon },
      { to: "/policy-generator", label: "Documents légaux", icon: FileText },
      { to: "/settings", label: "Réglages", icon: Settings2 },
    ],
  },
] as const;
