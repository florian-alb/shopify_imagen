import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { FeedProduct } from "../types"
import type { FeedProductSelection } from "../hooks/use-feed-product-selection"
import { GoogleFeedProductImage } from "./GoogleFeedProductImage"
import { GoogleFeedSelectionToolbar } from "./GoogleFeedSelectionToolbar"

const shortAttribute = { gender: "Genre", age_group: "Âge", google_product_category: "Catégorie" }

export function GoogleFeedProductList({
  products,
  selected,
  query,
  pending,
  hasPrevious,
  hasNext,
  onSearch,
  onSelect,
  onPrevious,
  onNext,
  bulkSelection,
}: {
  products: FeedProduct[]
  selected?: string
  query: string
  pending: boolean
  hasPrevious: boolean
  hasNext: boolean
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onPrevious: () => void
  onNext: () => void
  bulkSelection?: FeedProductSelection
}) {
  const checkedIds = useMemo(() => new Set(bulkSelection?.products.map((product) => product.id)), [bulkSelection?.products])
  return (
    <aside
      aria-label="Produits du flux Google"
      className="flex h-full min-w-0 flex-col lg:border-r"
    >
      <div className="relative m-4 sm:m-5">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Rechercher un produit"
          placeholder="Rechercher"
          value={query}
          disabled={bulkSelection?.busy}
          onChange={(event) => onSearch(event.target.value)}
          className="pl-9"
        />
      </div>
      {bulkSelection ? (
        <GoogleFeedSelectionToolbar products={products} pending={pending} selection={bulkSelection} />
      ) : null}
      <div
        aria-hidden="true"
        className={cn("grid grid-cols-[minmax(0,1fr)_4rem_2.5rem] gap-3 px-5 py-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_5rem_2.5rem]", bulkSelection && "pl-12 sm:pl-14")}
      >
        <span>Produit</span>
        <span>Champ</span>
        <span className="text-right">Var.</span>
      </div>
      <div aria-busy={pending} className="flex flex-1 flex-col divide-y">
        {pending
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="mx-5 my-3 h-14" />
            ))
          : products.map((product) => (
              <div key={product.id} className={cn("flex items-center", checkedIds.has(product.id) && "bg-primary/5")}>
                {bulkSelection ? (
                  <div className="pl-4 sm:pl-5">
                    <Checkbox aria-label={`Sélectionner ${product.title}`}
                      checked={checkedIds.has(product.id)} disabled={bulkSelection.busy}
                      onCheckedChange={(checked) => bulkSelection.select([product], checked === true)} />
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={bulkSelection?.busy}
                  aria-current={selected === product.id ? "true" : undefined}
                  className={cn(
                    "grid min-h-24 w-full grid-cols-[minmax(0,1fr)_4rem_2.5rem] items-center gap-3 px-4 py-4 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_5rem_2.5rem] sm:px-5",
                    selected === product.id && "lg:bg-primary/5",
                  )}
                  onClick={() => onSelect(product.id)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <GoogleFeedProductImage
                      key={product.featuredImageUrl}
                      src={product.featuredImageUrl}
                    />
                    <span className="min-w-0 break-words">{product.title}</span>
                  </span>
                  <span className="break-words text-xs text-muted-foreground">
                    {product.attributes.map((attribute) => shortAttribute[attribute]).join(" · ")}
                  </span>
                  <span
                    className="text-right tabular-nums"
                    aria-label={`${product.variantCount} variante${product.variantCount === 1 ? "" : "s"}`}
                  >
                    {product.variantCount || "—"}
                  </span>
                </button>
              </div>
            ))}
        {!pending && !products.length ? (
          <p className="px-5 py-12 text-sm text-muted-foreground">
            {hasNext
              ? "Aucun résultat ici. Page suivante disponible."
              : query
                ? "Aucun produit trouvé"
                : "Aucun produit dans cette vue"}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex justify-end gap-2 border-t p-4">
        <Button
          variant="outline"
          size="icon"
          aria-label="Produits précédents"
          disabled={!hasPrevious || pending || bulkSelection?.busy}
          onClick={onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Produits suivants"
          disabled={!hasNext || pending || bulkSelection?.busy}
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
      </div>
    </aside>
  )
}
