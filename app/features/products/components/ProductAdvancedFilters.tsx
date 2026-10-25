import { FilterSelect } from "@/components/common/FilterSelect";
import { SelectItem } from "@/components/ui/select";
import type { ProductSearch } from "@/lib/productFilters";
import { productGenerationStateLabels, productPublishStateLabels, productReviewStateLabels, shopifyStatusLabel } from "@/lib/status";
import type { ProductFacets } from "../types";

export function ProductAdvancedFilters({ search, facets, onFilterChange }: {
  search: ProductSearch;
  facets: ProductFacets | undefined;
  onFilterChange: (patch: Partial<ProductSearch>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FilterSelect
            value={search.type ?? ""}
            placeholder="Catégorie"
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
            placeholder="Génération"
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
            placeholder="Vérification"
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
  );
}
