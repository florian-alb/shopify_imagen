import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { StateBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { attributeLabels } from "../constants"
import type { ConflictProduct } from "../types"
import { GoogleFeedProductImage } from "./GoogleFeedProductImage"

export function GoogleFeedConflictList({
  products,
  selectedId,
  search,
  pending,
  page,
  hasMore,
  onSearch,
  onSelect,
  onPrevious,
  onNext,
}: {
  products: ConflictProduct[]
  selectedId?: string
  search: string
  pending: boolean
  page: number
  hasMore: boolean
  onSearch: (value: string) => void
  onSelect: (product: ConflictProduct) => void
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <aside
      className="flex min-w-0 flex-col border-b lg:border-r lg:border-b-0"
      aria-label="Produits à vérifier"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="font-semibold">Produits à vérifier</h2>
        <div className="relative">
          <Label htmlFor="conflict-search" className="sr-only">
            Rechercher un produit en conflit
          </Label>
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="conflict-search"
            value={search}
            placeholder="Rechercher un produit…"
            className="pl-9"
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto px-3 pb-3 lg:max-h-[48rem]" aria-busy={pending}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            aria-current={selectedId === product.id ? "true" : undefined}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedId === product.id && "border-primary bg-primary/5",
            )}
            onClick={() => onSelect(product)}
          >
            <GoogleFeedProductImage key={product.featuredImageUrl} src={product.featuredImageUrl} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="break-words text-sm font-medium">{product.title}</p>
              <p className="text-xs text-muted-foreground">
                {product.conflictCount} champ{product.conflictCount > 1 ? "s" : ""} en conflit
              </p>
              <div>
                <StateBadge state="warning">
                  {product.attributes.map((attribute) => attributeLabels[attribute]).join(" · ")}
                </StateBadge>
              </div>
              {product.manualCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {product.manualCount} correction{product.manualCount > 1 ? "s" : ""} manuelle
                  {product.manualCount > 1 ? "s" : ""} protégée{product.manualCount > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          </button>
        ))}
        {!products.length && !pending ? (
          <p className="p-3 text-sm text-muted-foreground">
            {hasMore
              ? "Aucun résultat dans cette partie du catalogue. Continuez la recherche."
              : "Aucun produit en conflit ne correspond à cette recherche."}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t p-4">
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pending || page === 1} onClick={onPrevious}>
            <ChevronLeft data-icon="inline-start" />
            Précédents
          </Button>
          <Button variant="outline" size="sm" disabled={pending || !hasMore} onClick={onNext}>
            Suivants
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
