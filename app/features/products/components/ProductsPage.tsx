import { RefreshCw, WandSparkles, X } from "lucide-react";
import { useQuery } from "convex/react";

import {
  BusyIcon,
  EmptyState,
  NumberedPaginator,
  PageHeader,
  pageContentClass,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/convex";
import type { ProductSearch } from "@/lib/productFilters";

import { useProductsListPage } from "../hooks/useProductsListPage";
import { BulkActionsMenu } from "./BulkActionsMenu";
import { BulkImageReorderDialogs } from "./BulkImageReorderDialogs";
import { BulkImageTransformDialogs } from "./BulkImageTransformDialogs";
import { ImageTypeSelectionDialog } from "./ImageTypeSelectionDialog";
import { ProductsFilters } from "./ProductsFilters";
import { ProductsTable } from "./ProductsTable";

export function ProductsPage({ search }: { search: ProductSearch }) {
  const shopInfo = useQuery(api.settings.shopInfo);
  const shopKey =
    shopInfo === undefined
      ? "loading"
      : (shopInfo.shopId ?? shopInfo.domain ?? "no-shop");

  return <ProductsPageForShop key={shopKey} search={search} />;
}

function ProductsPageForShop({ search }: { search: ProductSearch }) {
  const {
    allVisibleSelected,
    bulkLocksByProductId,
    bulkReorder,
    bulkTransform,
    chooserOpen,
    creatingJob,
    clearSelection,
    facets,
    filteredProductsCount,
    imageTypes,
    imageTypeSelection,
    variants,
    loaded,
    page,
    pageSize,
    productPage,
    products,
    selected,
    syncing,
    totalProducts,
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
    <main className={pageContentClass}>
      <PageHeader
        eyebrow={
          totalProducts === undefined
            ? "Chargement du total…"
            : `${totalProducts.toLocaleString("fr-FR")} produit${totalProducts === 1 ? "" : "s"} au total`
        }
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
          </>
        }
      ></PageHeader>

      <ProductsFilters
        search={search}
        facets={facets}
        resultCount={filteredProductsCount}
        onFilterChange={updateFilters}
      />

      {!loaded ? (
        <EmptyState
          loading
          title="Chargement des produits"
          body="Votre catalogue sera disponible dans un instant."
        />
      ) : products.length === 0 ? (
        <EmptyState
          title={totalProducts ? "Aucun résultat" : "Aucun produit"}
          body={totalProducts ? "Modifiez vos filtres pour retrouver vos produits." : "Synchronisez Shopify pour importer les produits actifs."}
        />
      ) : (
        <ProductsTable
          key={JSON.stringify(search)}
          products={products}
          search={search}
          selected={selected}
          bulkLocksByProductId={bulkLocksByProductId}
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
            className="flex-row flex-wrap items-center justify-between gap-3 rounded-xl p-3 sm:px-4"
          >
            <div>
              <p className="text-sm font-medium">
                {selected.size} produit{selected.size === 1 ? "" : "s"}{" "}
                sélectionné{selected.size === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Sélection conservée entre les pages.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="icon-sm" onClick={clearSelection} aria-label="Effacer la sélection">
                <X />
              </Button>
              <BulkActionsMenu
                disabled={bulkTransform.busy || bulkReorder.busy}
                onReorder={bulkReorder.openNew}
                onFlip={bulkTransform.openNew}
              />
              <Button size="sm" onClick={openChooser}>
                <WandSparkles data-icon="inline-start" />
                Générer des visuels
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {chooserOpen ? (
        <ImageTypeSelectionDialog
          open={chooserOpen}
          onOpenChange={setChooserOpen}
          types={imageTypes}
          selectedTypes={imageTypeSelection.selectedTypes}
          variants={variants}
          busy={creatingJob}
          title="Générer des visuels"
          description={`${selected.size} produit${
            selected.size === 1 ? "" : "s"
          } sélectionné${
            selected.size === 1 ? "" : "s"
          }. Chaque type utilise son prompt actif.`}
          submitLabel="Lancer la génération"
          onToggleType={imageTypeSelection.toggleType}
          onGenerate={() => void generate()}
        />
      ) : null}

      <BulkImageReorderDialogs bulkReorder={bulkReorder} />
      <BulkImageTransformDialogs bulkTransform={bulkTransform} />
    </main>
  );
}
