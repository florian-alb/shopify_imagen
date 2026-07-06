import { Search, SlidersHorizontal } from "lucide-react";

import { FilterSelect } from "@/components/common/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectItem } from "@/components/ui/select";
import type { ProductSearch } from "@/lib/productFilters";
import {
  productGenerationStateLabels,
  productPublishStateLabels,
  productReviewStateLabels,
  shopifyStatusLabel,
  type ProductPrimaryAction,
} from "@/lib/status";

import type { ProductFacets } from "../types";

const actionTabs: Array<{ label: string; value?: ProductPrimaryAction }> = [
  { label: "Tous" },
  { label: "A traiter", value: "generate" },
  { label: "A verifier", value: "review" },
  { label: "Pret", value: "push" },
  { label: "Publie", value: "done" },
];

export function ProductsFilters({
  search,
  facets,
  onFilterChange,
}: {
  search: ProductSearch;
  facets: ProductFacets | undefined;
  onFilterChange: (patch: Partial<ProductSearch>) => void;
}) {
  return (
    <Card className="studio-card mb-4 rounded-lg">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1">
            {actionTabs.map((tab) => {
              const active =
                search.action === tab.value || (!search.action && !tab.value);
              return (
                <Button
                  key={tab.label}
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className={active ? "" : "text-muted-foreground"}
                  onClick={() => onFilterChange({ action: tab.value })}
                >
                  {tab.label}
                </Button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row xl:max-w-2xl">
            <Label className="relative block min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                value={search.q ?? ""}
                onChange={(event) =>
                  onFilterChange({ q: event.target.value || undefined })
                }
                placeholder="Rechercher un produit ou handle"
              />
            </Label>
            <Button variant="outline" size="sm" className="justify-start gap-2">
              <SlidersHorizontal className="size-4" />
              Filtres
            </Button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <FilterSelect
            value={search.type ?? ""}
            placeholder="Categorie"
            clearValue=""
            onChange={(type) => onFilterChange({ type: type || undefined })}
          >
            {facets?.productTypes.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.collection ?? ""}
            placeholder="Collection"
            clearValue=""
            onChange={(collection) =>
              onFilterChange({ collection: collection || undefined })
            }
          >
            {facets?.collections.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.shopifyStatus ?? ""}
            placeholder="Shopify"
            clearValue=""
            onChange={(shopifyStatus) =>
              onFilterChange({ shopifyStatus: shopifyStatus || undefined })
            }
          >
            {facets?.shopifyStatuses.map((item) => (
              <SelectItem key={item} value={item}>
                {shopifyStatusLabel(item)}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.generation ?? ""}
            placeholder="Generation"
            clearValue=""
            onChange={(generation) =>
              onFilterChange({
                generation: (generation || undefined) as ProductSearch["generation"],
              })
            }
          >
            {Object.entries(productGenerationStateLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.review ?? ""}
            placeholder="Review"
            clearValue=""
            onChange={(review) =>
              onFilterChange({
                review: (review || undefined) as ProductSearch["review"],
              })
            }
          >
            {Object.entries(productReviewStateLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={search.publish ?? ""}
            placeholder="Publication"
            clearValue=""
            onChange={(publish) =>
              onFilterChange({
                publish: (publish || undefined) as ProductSearch["publish"],
              })
            }
          >
            {Object.entries(productPublishStateLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
        </div>
      </CardContent>
    </Card>
  );
}
