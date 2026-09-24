import { Boxes, FolderInput, ImageIcon, Layers3, ListChecks, Tags } from "lucide-react";

export const navGroups = [
  {
    label: "Navigation",
    items: [
      { to: "/products", label: "Produits", icon: Boxes },
      { to: "/jobs", label: "Generations", icon: ListChecks },
      { to: "/bulk-operations", label: "Bulk operations", icon: Layers3 },
      { to: "/google-feed", label: "Flux Google", icon: Tags },
      { to: "/catalog-import", label: "Import de catalogue", icon: FolderInput },
      { to: "/settings/prompts", label: "Prompts", icon: ImageIcon },
    ],
  },
] as const;
