import { createFileRoute } from "@tanstack/react-router";

import { ProductDetailPage } from "@/features/products/components/ProductDetailPage";
import { validateProductSearch } from "@/lib/productFilters";

export const Route = createFileRoute("/products/$productId")({
  validateSearch: validateProductSearch,
  component: ProductDetailRoute,
});

function ProductDetailRoute() {
  const { productId } = Route.useParams();
  const search = Route.useSearch();

  return <ProductDetailPage productId={productId} search={search} />;
}
