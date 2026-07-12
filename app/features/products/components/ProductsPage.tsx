import { Link } from "@tanstack/react-router";
import {
  Activity,
  FlipHorizontal2,
  ImageIcon,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
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
    bulkTransform,
    chooserOpen,
    creatingJob,
    facets,
    imageTypes,
    imageTypeSelection,
    loaded,
    page,
    pageSize,
    productPage,
    products,
    selected,
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
    <main className={pageContentClass}>
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
            {bulkTransform.hasTrackedJob ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/bulk-operations">
                  <Activity data-icon="inline-start" />
                  Voir les bulks
                </Link>
              </Button>
            ) : null}
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
            className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl"
          >
            <div>
              <p className="text-sm font-medium">
                {selected.size} produit{selected.size === 1 ? "" : "s"}{" "}
                selectionne{selected.size === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Lancez une génération ou une transformation sur la sélection.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={bulkTransform.busy}
                onClick={bulkTransform.openNew}
              >
                <FlipHorizontal2 data-icon="inline-start" />
                Miroir horizontal
              </Button>
              <Button size="sm" onClick={openChooser}>
                <ImageIcon data-icon="inline-start" />
                Types
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
          busy={creatingJob}
          title="Types d'images"
          description={`${selected.size} produit${
            selected.size === 1 ? "" : "s"
          } selectionne${
            selected.size === 1 ? "" : "s"
          }. Chaque type utilise son prompt actif.`}
          submitLabel="Lancer le job"
          onToggleType={imageTypeSelection.toggleType}
          onGenerate={() => void generate()}
        />
      ) : null}

      <BulkImageTransformDialogs bulkTransform={bulkTransform} />
    </main>
  );
}
