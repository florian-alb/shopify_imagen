import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductSearch } from "@/lib/productFilters";
import type { Doc } from "@/lib/convex";

export function ProductNavigationButton({
  direction,
  product,
  search,
}: {
  direction: "previous" | "next";
  product: Doc<"products"> | null | undefined;
  search: ProductSearch;
}) {
  const label = direction === "previous" ? "Previous" : "Next";
  const icon =
    direction === "previous" ? (
      <ChevronLeft data-icon="inline-start" />
    ) : (
      <ChevronRight data-icon="inline-end" />
    );

  if (!product) {
    return (
      <Button variant="outline" size="sm" disabled>
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        to="/products/$productId"
        params={{ productId: product._id }}
        search={search}
        title={product.title}
      >
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </Link>
    </Button>
  );
}
