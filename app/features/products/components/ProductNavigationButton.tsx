import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adjacentProductSearch, type ProductWorkspaceSearch } from "../lib/productWorkspaceSearch";
import type { Doc } from "@/lib/convex";

export function ProductNavigationButton({
  direction,
  product,
  search,
}: {
  direction: "previous" | "next";
  product: Doc<"products"> | null | undefined;
  search: ProductWorkspaceSearch;
}) {
  const label = direction === "previous" ? "Précédent" : "Suivant";
  const icon =
    direction === "previous" ? (
      <ChevronLeft data-icon="inline-start" />
    ) : (
      <ChevronRight data-icon="inline-end" />
    );

  if (!product) {
    return (
      <Button variant="outline" size="sm" className="size-11 p-0 sm:h-8 sm:w-auto sm:px-3" aria-label={label} disabled>
        {direction === "previous" ? icon : null}
        <span className="hidden sm:inline">{label}</span>
        {direction === "next" ? icon : null}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" className="size-11 p-0 sm:h-8 sm:w-auto sm:px-3" asChild>
      <Link
        to="/products/$productId"
        params={{ productId: product._id }}
        search={adjacentProductSearch(search)}
        title={product.title}
        aria-label={label}
      >
        {direction === "previous" ? icon : null}
        <span className="hidden sm:inline">{label}</span>
        {direction === "next" ? icon : null}
      </Link>
    </Button>
  );
}
