import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/features/products/components/ProductsPage";
import { validateProductSearch } from "@/lib/productFilters";

export const Route = createFileRoute("/products/")({
  validateSearch: validateProductSearch,
  component: ProductsRoute,
});

function ProductsRoute() {
  const search = Route.useSearch();

  return <ProductsPage search={search} />;
}
