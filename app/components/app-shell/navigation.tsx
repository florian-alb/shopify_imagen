import { Boxes, ImageIcon, ListChecks } from "lucide-react";

export const navGroups = [
  {
    label: "Navigation",
    items: [
      { to: "/products", label: "Produits", icon: Boxes },
      { to: "/jobs", label: "Generations", icon: ListChecks },
      { to: "/settings/prompts", label: "Prompts", icon: ImageIcon },
    ],
  },
] as const;
