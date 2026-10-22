import { createFileRoute } from "@tanstack/react-router";

import { ProductDetailPage } from "@/features/products/components/ProductDetailPage";
import { validateProductWorkspaceSearch } from "@/features/products/lib/productWorkspaceSearch";

export const Route = createFileRoute("/products/$productId")({
  validateSearch: validateProductWorkspaceSearch,
  component: ProductDetailRoute,
});

function ProductDetailRoute() {
  const { productId } = Route.useParams();
  const search = Route.useSearch();

  return <ProductDetailPage key={productId} productId={productId} search={search} />;
}
