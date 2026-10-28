import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import type { FeedProductSelection } from "../hooks/use-feed-product-selection"
import type { FeedProduct } from "../types"

export function GoogleFeedSelectionToolbar({ products, pending, selection }: {
  products: FeedProduct[]
  pending: boolean
  selection: FeedProductSelection
}) {
  const selectedIds = useMemo(() => new Set(selection.products.map((product) => product.id)), [selection.products])
  const checkedOnPage = products.filter((product) => selectedIds.has(product.id)).length
  return (
    <div className="flex flex-col gap-3 border-b px-5 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <Field orientation="horizontal" className="w-auto flex-1">
          <Checkbox id="feed-select-page" aria-label="Sélectionner tous les produits de cette page"
            disabled={pending || selection.busy || !products.length}
            checked={checkedOnPage && checkedOnPage === products.length ? true : checkedOnPage ? "indeterminate" : false}
            onCheckedChange={(checked) => selection.select(products, checked === true)} />
          <FieldLabel htmlFor="feed-select-page" className="text-xs font-normal">
            {selection.products.length ? `${selection.products.length} sélectionné${selection.products.length === 1 ? "" : "s"}` : "Toute la page"}
          </FieldLabel>
        </Field>
        <Button variant="outline" size="sm" disabled={!selection.products.length || selection.busy || pending}
          onClick={() => selection.open(true)}>Corriger la sélection</Button>
      </div>
      {selection.selecting ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted-foreground">
            Recherche des produits… {selection.found} trouvé{selection.found === 1 ? "" : "s"}
          </p>
          <Button size="sm" variant="ghost" onClick={selection.cancelSelection}>Annuler la sélection</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {selection.allFiltered ? (
            <p role="status" className="text-xs text-muted-foreground">
              Tous les {selection.products.length} produits filtrés sont sélectionnés.
            </p>
          ) : (
            <Button variant="link" size="sm" className="h-auto max-w-full p-0 text-left text-xs whitespace-normal"
              disabled={pending || selection.busy} onClick={() => void selection.selectFiltered()}>
              Sélectionner tous les produits filtrés
            </Button>
          )}
          {selection.products.length ? (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs"
              disabled={selection.busy} onClick={selection.clear}>Tout désélectionner</Button>
          ) : null}
        </div>
      )}
      {selection.error ? <p role="alert" className="break-words text-xs text-destructive">{selection.error}</p> : null}
    </div>
  )
}
