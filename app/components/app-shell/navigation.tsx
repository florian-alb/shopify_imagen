import { Boxes, ImageIcon, Layers3, ListChecks } from "lucide-react";

export const navGroups = [
  {
    label: "Navigation",
    items: [
      { to: "/products", label: "Produits", icon: Boxes },
      { to: "/jobs", label: "Generations", icon: ListChecks },
      { to: "/bulk-operations", label: "Bulk operations", icon: Layers3 },
      { to: "/settings/prompts", label: "Prompts", icon: ImageIcon },
    ],
  },
] as const;
