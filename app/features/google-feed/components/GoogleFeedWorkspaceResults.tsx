import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex";
import { nextFeedProduct, type FeedSearch } from "../lib/workspace-search";
import { useFeedProductSelection } from "../hooks/use-feed-product-selection";
import { GoogleFeedBulkDecision } from "./GoogleFeedBulkDecision";
import { GoogleFeedDataBoundary } from "./GoogleFeedDataBoundary";
import { GoogleFeedProductList } from "./GoogleFeedProductList";
import { GoogleFeedProductInspector } from "./GoogleFeedProductInspector";

export function GoogleFeedWorkspaceResults({
  search,
  update,
}: {
  search: FeedSearch;
  update: (patch: Partial<FeedSearch>, replace?: boolean) => void;
}) {
  const shop = useQuery(api.shops.current);
  const bulk = useFeedProductSelection(
    JSON.stringify([search.view, search.q, shop?._id, shop?.domain]),
    search.q ?? "",
  );
  const [query, setQuery] = useState(search.q ?? "");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.q ?? ""), 250);
    return () => window.clearTimeout(timer);
  }, [search.q]);
  const page = useQuery(api.googleFeedWorkspace.listProducts, {
    view: search.view,
    search: query,
    after: search.after as Id<"products"> | undefined,
  });
  const selected = search.product ?? page?.products[0]?.id;
  const trail = search.trail ?? [];
  const scannedCursor = useRef<string | null>(null);
  useEffect(() => {
    const cursorKey = JSON.stringify([query, search.after, page?.after]);
    if (
      !query ||
      !page?.hasMore ||
      page.products.length ||
      !page.after ||
      scannedCursor.current === cursorKey
    )
      return;
    scannedCursor.current = cursorKey;
    update(
      {
        after: page.after,
        trail: [...(search.trail ?? []), search.after ?? ""],
        product: undefined,
      },
      true,
    );
  }, [page, query, search.after, search.trail, update]);
  function nextPage() {
    if (page?.hasMore && page.after)
      update({
        after: page.after,
        trail: [...trail, search.after ?? ""],
        product: undefined,
      });
  }
  function nextProduct() {
    const next = nextFeedProduct(page?.products ?? [], selected);
    const index =
      page?.products.findIndex((product) => product.id === selected) ?? -1;
    if (index === (page?.products.length ?? 0) - 1 && page?.hasMore) nextPage();
    else update({ product: next }, true);
  }
  return (
    <div className="grid min-w-0 border-b lg:min-h-[38rem] lg:grid-cols-[minmax(19rem,0.95fr)_minmax(0,1.05fr)]">
      <div className={search.product || bulk.isOpen ? "hidden min-w-0 lg:block" : "min-w-0"}>
        <GoogleFeedProductList
          products={page?.products ?? []}
          selected={selected}
          query={search.q ?? ""}
          pending={!page || shop === undefined || query !== (search.q ?? "")}
          hasPrevious={trail.length > 0}
          hasNext={page?.hasMore ?? false}
          bulkSelection={search.view === "review" ? bulk : undefined}
          onSearch={(q) =>
            update(
              {
                q: q || undefined,
                after: undefined,
                trail: undefined,
                product: undefined,
              },
              true,
            )
          }
          onSelect={(product) => {
            bulk.open(false);
            update({ product });
          }}
          onPrevious={() =>
            update({
              after: trail.at(-1) || undefined,
              trail: trail.slice(0, -1),
              product: undefined,
            })
          }
          onNext={nextPage}
        />
      </div>
      <section
        aria-label={bulk.isOpen ? "Correction groupée" : "Produit sélectionné"}
        className={search.product || bulk.isOpen ? "min-w-0" : "hidden min-w-0 lg:block"}
      >
        <Button
          variant="ghost"
          className="mt-3 lg:hidden"
          disabled={bulk.busy}
          onClick={() => {
            bulk.open(false);
            update({ product: undefined });
          }}
        >
          <ArrowLeft data-icon="inline-start" />
          Produits
        </Button>
        <GoogleFeedDataBoundary key={bulk.isOpen ? "bulk" : `${search.view}:${selected ?? ""}`}>
          {bulk.isOpen ? (
            <GoogleFeedBulkDecision
              products={bulk.products}
              allFiltered={bulk.allFiltered}
              onDone={bulk.remove}
              onBusyChange={bulk.setBusy}
              onCancel={() => bulk.open(false)}
            />
          ) : selected ? (
            <GoogleFeedProductInspector
              key={`${search.view}:${selected}`}
              productId={selected as Id<"products">}
              view={search.view}
              returnSearch={{ ...search, product: selected }}
              position={
                Math.max(
                  0,
                  page?.products.findIndex(
                    (product) => product.id === selected,
                  ) ?? 0,
                ) + 1
              }
              canSkip={
                (page?.products.length ?? 0) > 1 || Boolean(page?.hasMore)
              }
              onNext={nextProduct}
            />
          ) : (
            <div className="grid min-h-64 place-items-center p-6 text-sm text-muted-foreground">
              {page ? "Aucun produit à afficher" : "Chargement…"}
            </div>
          )}
        </GoogleFeedDataBoundary>
      </section>
    </div>
  );
}
