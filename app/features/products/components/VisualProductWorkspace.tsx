import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Id } from "@/lib/convex";
import { visualProductStatusLabels, type VisualProductViewModel } from "../lib/visualProductWorkspace";

export function VisualProductWorkspace({ visualProducts, activeGroupId, children, onSelect }: {
  visualProducts: VisualProductViewModel[];
  activeGroupId: Id<"visualGroups"> | null;
  children: ReactNode;
  onSelect: (groupId: Id<"visualGroups"> | null) => void;
}) {
  return <section aria-label="Produit et déclinaisons" className="min-w-0 space-y-3">
    {visualProducts.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <label htmlFor="product-scope" className="text-xs font-medium text-muted-foreground">Périmètre des images et des actions</label>
        <Select value={activeGroupId ?? "overview"} onValueChange={value => onSelect(value === "overview" ? null : value as Id<"visualGroups">)}>
          <SelectTrigger id="product-scope" className="h-11 w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="overview">Vue d’ensemble · Toutes les déclinaisons</SelectItem>
            {visualProducts.map(item => <SelectItem key={item.group._id} value={item.group._id}>
              {item.group.label} · {visualProductStatusLabels[item.status]}
            </SelectItem>)}
          </SelectContent>
        </Select>
    </div>}
    {children}
  </section>;
}
