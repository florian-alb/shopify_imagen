import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductSearch } from "@/lib/productFilters";
import type { ProductPrimaryAction } from "@/lib/status";
import type { ProductFacets } from "../types";
import { ProductAdvancedFilters } from "./ProductAdvancedFilters";

const actionTabs: Array<{ label: string; value: ProductPrimaryAction | "all" }> = [
  { label: "Tous", value: "all" },
  { label: "À générer", value: "generate" },
  { label: "À vérifier", value: "review" },
  { label: "Prêts à publier", value: "push" },
  { label: "En cours", value: "wait" },
  { label: "À reprendre", value: "fix_errors" },
  { label: "Publiés", value: "done" },
];

export function ProductsFilters({ search, facets, resultCount, onFilterChange }: {
  search: ProductSearch;
  facets: ProductFacets | undefined;
  resultCount: number | undefined;
  onFilterChange: (patch: Partial<ProductSearch>) => void;
}) {
  const advancedCount = [search.type, search.collection, search.shopifyStatus, search.generation, search.review, search.publish, search.status].filter(Boolean).length;
  const [expanded, setExpanded] = useState(advancedCount > 0);
  const hasFilters = Boolean(advancedCount || search.q || search.action);

  function resetFilters() {
    onFilterChange({ q: undefined, action: undefined, type: undefined, collection: undefined,
      shopifyStatus: undefined, generation: undefined, review: undefined, publish: undefined, status: undefined });
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="mb-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" type="search" aria-label="Rechercher un produit ou un handle"
            value={search.q ?? ""} onChange={(event) => onFilterChange({ q: event.target.value || undefined })}
            placeholder="Rechercher un produit ou un handle…" />
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="h-10"><SlidersHorizontal />Filtres{advancedCount > 0 && <span className="tabular-nums">· {advancedCount}</span>}</Button>
        </CollapsibleTrigger>
        {hasFilters && <Button variant="ghost" onClick={resetFilters} aria-label="Effacer tous les filtres"><X /><span className="hidden sm:inline">Effacer</span></Button>}
      </div>
      <CollapsibleContent className="studio-panel p-4">
        <ProductAdvancedFilters search={search} facets={facets} onFilterChange={onFilterChange} />
      </CollapsibleContent>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:hidden">
          <Select value={search.action ?? "all"} onValueChange={action => onFilterChange({ action: action === "all" ? undefined : action as ProductPrimaryAction })}>
            <SelectTrigger className="h-11 w-full" aria-label="Filtrer les produits par action"><SelectValue /></SelectTrigger>
            <SelectContent>{actionTabs.map(tab => <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="hidden max-w-full overflow-x-auto pb-1 sm:block">
          <SegmentedControl className="w-[43rem]" value={search.action ?? "all"} options={actionTabs}
            ariaLabel="Filtrer les produits par action" onValueChange={(action) => onFilterChange({ action: action === "all" ? undefined : action })} />
        </div>
        <p className="text-xs tabular-nums text-muted-foreground" role="status" aria-live="polite">
          {resultCount === undefined ? "Recherche…" : `${resultCount.toLocaleString("fr-FR")} résultat${resultCount === 1 ? "" : "s"}`}
        </p>
      </div>
    </Collapsible>
  );
}
