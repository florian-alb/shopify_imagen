import { ImageIcon, RefreshCw, WandSparkles } from "lucide-react";

import { BusyIcon, EmptyState, NumberedPaginator, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProductSearch } from "@/lib/productFilters";

import { useProductsListPage } from "../hooks/useProductsListPage";
import { ImageTypeSelectionDialog } from "./ImageTypeSelectionDialog";
import { ProductsFilters } from "./ProductsFilters";
import { ProductsTable } from "./ProductsTable";

export function ProductsPage({ search }: { search: ProductSearch }) {
  const {
    allVisibleSelected,
    chooserOpen,
    creatingJob,
    facets,
    loaded,
    page,
    pageSize,
    productPage,
    products,
    selected,
    selectedProducts,
    syncing,
    generate,
    openChooser,
    openChooserForProduct,
    runSync,
    setChooserOpen,
    toggleProduct,
    toggleVisible,
    updateFilters,
    updatePage,
    updatePageSize,
  } = useProductsListPage(search);

  return (
    <main className="page">
      <PageHeader
        eyebrow={`${
          productPage?.hasNext ? `${pageSize}+` : products.length
        } produits visibles`}
        title="Produits"
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runSync()}
              disabled={syncing}
            >
              <BusyIcon busy={syncing} />
              {!syncing ? <RefreshCw data-icon="inline-start" /> : null}
              Synchroniser
            </Button>
            <Button size="sm" disabled={!selected.size} onClick={openChooser}>
              <WandSparkles data-icon="inline-start" />
              Generer
            </Button>
          </>
        }
      >
        Catalogue Shopify, generations image et publication en une seule table.
      </PageHeader>

      <ProductsFilters
        search={search}
        facets={facets}
        onFilterChange={updateFilters}
      />

      {!loaded ? (
        <EmptyState
          loading
          title="Chargement des produits"
          body="Lecture du catalogue synchronise depuis Convex."
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Aucun produit"
          body="Synchronisez Shopify pour importer les produits actifs."
        />
      ) : (
        <ProductsTable
          products={products}
          search={search}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          onToggleProduct={toggleProduct}
          onToggleVisible={toggleVisible}
          onGenerateOne={openChooserForProduct}
        />
      )}

      <NumberedPaginator
        page={page}
        pageSize={pageSize}
        hasPrevious={productPage?.hasPrevious ?? false}
        hasNext={productPage?.hasNext ?? false}
        loading={!loaded}
        onPageChange={updatePage}
        onPageSizeChange={updatePageSize}
      />

      {selected.size ? (
        <div className="sticky-actions">
          <Card
            size="sm"
            className="studio-card flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl"
          >
            <div>
              <p className="text-sm font-medium">
                {selected.size} produit{selected.size === 1 ? "" : "s"}{" "}
                selectionne{selected.size === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Choisissez les formats avant de lancer le job.
              </p>
            </div>
            <Button size="sm" onClick={openChooser}>
              <ImageIcon data-icon="inline-start" />
              Types
            </Button>
          </Card>
        </div>
      ) : null}

      {chooserOpen ? (
        <ImageTypeSelectionDialog
          open={chooserOpen}
          products={selectedProducts}
          submitting={creatingJob}
          onOpenChange={setChooserOpen}
          onGenerate={(types) => void generate(types)}
        />
      ) : null}
    </main>
  );
}
