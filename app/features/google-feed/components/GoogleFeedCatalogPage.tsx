import { useNavigate } from "@tanstack/react-router";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState, NumberedPaginator } from "@/components/page";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex";

import type { GoogleFeedCatalogSearch } from "../lib/search";
import { GoogleFeedBulkBar } from "./GoogleFeedBulkBar";
import {
  GoogleFeedCatalogTable,
  type GoogleFeedCatalogProduct,
} from "./GoogleFeedCatalogTable";
import { GoogleFeedFilters } from "./GoogleFeedFilters";
import { GoogleFeedPageFrame } from "./GoogleFeedPageFrame";

export function GoogleFeedCatalogPage({
  search,
}: {
  search: GoogleFeedCatalogSearch;
}) {
  const navigate = useNavigate();
  const convex = useConvex();
  const overview = useQuery(api.googleFeed.overview);
  const facets = useQuery(api.products.facets);
  const catalog = useQuery(api.googleFeed.catalog, {
    offset: (search.page - 1) * search.size,
    limit: search.size,
    search: search.q,
    filter: search.view,
    productType: search.productType,
    collection: search.collection,
    shopifyStatus: search.shopifyStatus,
    gender: search.gender,
    ageGroup: search.ageGroup,
  });
  const setProductDraft = useMutation(api.googleFeed.setProductDraft);
  const setVariantDraft = useMutation(api.googleFeed.setVariantDraft);
  const evaluateRules = useAction(api.googleFeedActions.evaluateRules);
  const [expanded, setExpanded] = useState<Set<Id<"products">>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<Id<"products">>>(
    new Set(),
  );
  const [selectedProductVariantCounts, setSelectedProductVariantCounts] =
    useState<Map<Id<"products">, number>>(new Map());
  const [selectedVariants, setSelectedVariants] = useState<
    Set<Id<"productVariants">>
  >(new Set());
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const products = (catalog?.page ?? []) as GoogleFeedCatalogProduct[];
  const selectionScopeKey = catalogSelectionScopeKey(search);
  const selectionScopeRef = useRef(selectionScopeKey);
  const readiness = useMemo(() => {
    const attributes = overview?.config?.attributes ?? [];
    const ready = (attribute: string) =>
      attributes.some(
        (item) => item.attribute === attribute && item.status === "ready",
      );
    return {
      category: ready("google_product_category"),
      gender: ready("gender"),
      ageGroup: ready("age_group"),
    };
  }, [overview?.config?.attributes]);
  const selectedProductVariantCount = Array.from(
    selectedProductVariantCounts.values(),
  ).reduce((total, count) => total + count, 0);
  const selectedVariantCount =
    selectedProductVariantCount + selectedVariants.size;
  const selectedPageCount = products.filter((product) =>
    selectedProducts.has(product.id),
  ).length;
  const pageSelectionState: boolean | "indeterminate" =
    selectedPageCount === 0
      ? false
      : selectedPageCount === products.length
        ? true
        : "indeterminate";
  function updateSearch(patch: Partial<GoogleFeedCatalogSearch>) {
    const nextSearch = { ...search, ...patch };
    const nextSelectionScopeKey = catalogSelectionScopeKey(nextSearch);
    if (nextSelectionScopeKey !== selectionScopeKey) {
      selectionScopeRef.current = nextSelectionScopeKey;
      clearSelection();
      setSelectingAll(false);
    }
    void navigate({
      to: "/google-feed",
      search: nextSearch,
      replace: true,
    });
  }

  function toggleSet<T>(current: Set<T>, value: T, selected: boolean) {
    const next = new Set(current);
    if (selected) next.add(value);
    else next.delete(value);
    return next;
  }

  function selectPage(selected: boolean) {
    setSelectedProducts((current) => {
      const next = new Set(current);
      for (const product of products) {
        if (selected) next.add(product.id);
        else next.delete(product.id);
      }
      return next;
    });
    setSelectedProductVariantCounts((current) => {
      const next = new Map(current);
      for (const product of products) {
        if (selected) next.set(product.id, product.variantCount);
        else next.delete(product.id);
      }
      return next;
    });
    if (selected) setSelectedVariants(new Set());
    setAllFilteredSelected(false);
  }

  async function selectAllFilteredProducts() {
    const requestedScope = selectionScopeKey;
    setSelectingAll(true);
    try {
      const nextProducts = new Set<Id<"products">>();
      const nextVariantCounts = new Map<Id<"products">, number>();
      let offset = 0;
      while (true) {
        const result = await convex.query(api.googleFeed.catalog, {
          offset,
          limit: 50,
          search: search.q,
          filter: search.view,
          productType: search.productType,
          collection: search.collection,
          shopifyStatus: search.shopifyStatus,
          gender: search.gender,
          ageGroup: search.ageGroup,
        });
        if (selectionScopeRef.current !== requestedScope) return;
        for (const product of result.page) {
          nextProducts.add(product.id);
          nextVariantCounts.set(product.id, product.variantCount);
        }
        if (!result.hasNext || result.page.length === 0) break;
        offset += result.page.length;
      }
      setSelectedProducts(nextProducts);
      setSelectedProductVariantCounts(nextVariantCounts);
      setSelectedVariants(new Set());
      setAllFilteredSelected(true);
      toast.success("Tous les résultats filtrés sont sélectionnés", {
        description: `${nextProducts.size} produit${nextProducts.size === 1 ? "" : "s"} concerné${nextProducts.size === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      toast.error("Sélection impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (selectionScopeRef.current === requestedScope) setSelectingAll(false);
    }
  }

  function clearSelection() {
    setSelectedProducts(new Set());
    setSelectedProductVariantCounts(new Map());
    setSelectedVariants(new Set());
    setAllFilteredSelected(false);
  }

  async function editProduct(
    productId: Id<"products">,
    attribute: "google_product_category" | "gender",
    value: string,
  ) {
    try {
      const result = await setProductDraft({ productId, attribute, value });
      toast.success("Modification ajoutée au brouillon", {
        description:
          attribute === "gender"
            ? `${result.updatedDrafts} variantes concernées.`
            : "Aucune écriture Shopify n’a encore été effectuée.",
      });
    } catch (error) {
      toast.error("Modification impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function editVariant(variantId: Id<"productVariants">, value: string) {
    try {
      await setVariantDraft({ variantId, value });
      toast.success("Tranche d’âge ajoutée au brouillon");
    } catch (error) {
      toast.error("Modification impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function applyRules() {
    setBusy(true);
    try {
      const result = await evaluateRules({
        productIds: Array.from(selectedProducts),
        variantIds: Array.from(selectedVariants),
      });
      toast.success("Règles appliquées à la sélection", {
        description: `${result.proposed} propositions enregistrées. Rien n’a été publié dans Shopify.`,
      });
    } catch (error) {
      toast.error("Évaluation impossible", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function bulkProducts(
    attribute: "google_product_category" | "gender",
    value: string,
  ) {
    setBusy(true);
    try {
      await Promise.all(
        Array.from(selectedProducts, (productId) =>
          setProductDraft({ productId, attribute, value }),
        ),
      );
      toast.success("Sélection ajoutée au brouillon");
    } catch (error) {
      toast.error("Action groupée incomplète", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function bulkVariants(value: string) {
    setBusy(true);
    try {
      await Promise.all(
        Array.from(selectedVariants, (variantId) =>
          setVariantDraft({ variantId, value }),
        ),
      );
      toast.success("Variantes ajoutées au brouillon");
    } catch (error) {
      toast.error("Action groupée incomplète", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GoogleFeedPageFrame active="catalog">
      <GoogleFeedFilters
        key={search.q ?? ""}
        search={search}
        facets={facets}
        onChange={updateSearch}
      />
      {catalog === undefined ? (
        <EmptyState
          loading
          title="Chargement du catalogue"
          body="Lecture des produits et variantes de la boutique active."
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Aucun produit dans cette vue"
          body={
            overview?.productCount
              ? "Modifiez les filtres pour retrouver vos produits."
              : "Synchronisez Shopify pour importer les produits et leurs variantes."
          }
        >
          {search.view !== "all" || search.q ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateSearch({ view: "all", q: undefined, page: 1 })
              }
            >
              Effacer les filtres
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <GoogleFeedCatalogTable
            products={products}
            expanded={expanded}
            selectedProducts={selectedProducts}
            selectedVariants={selectedVariants}
            pageSelection={pageSelectionState}
            selectionCount={selectedProducts.size + selectedVariants.size}
            allFilteredSelected={allFilteredSelected}
            selectingAll={selectingAll}
            categoryEnabled={readiness.category}
            genderEnabled={readiness.gender}
            ageGroupEnabled={readiness.ageGroup}
            onExpand={(productId) =>
              setExpanded((current) =>
                toggleSet(current, productId, !current.has(productId)),
              )
            }
            onSelectPage={selectPage}
            onSelectAllFiltered={() => void selectAllFilteredProducts()}
            onClearSelection={clearSelection}
            onSelectProduct={(productId, selected) => {
              setSelectedProducts((current) =>
                toggleSet(current, productId, selected),
              );
              setSelectedProductVariantCounts((current) => {
                const next = new Map(current);
                const product = products.find((item) => item.id === productId);
                if (selected && product)
                  next.set(productId, product.variantCount);
                else next.delete(productId);
                return next;
              });
              if (selected) setSelectedVariants(new Set());
              setAllFilteredSelected(false);
            }}
            onSelectVariant={(variantId, selected) =>
              setSelectedVariants((current) =>
                toggleSet(current, variantId, selected),
              )
            }
            onCategory={(productId, value) =>
              void editProduct(productId, "google_product_category", value)
            }
            onGender={(productId, value) =>
              void editProduct(productId, "gender", value)
            }
            onAgeGroup={(variantId, value) =>
              void editVariant(variantId, value)
            }
          />
          <NumberedPaginator
            page={search.page}
            pageSize={search.size}
            hasPrevious={catalog.hasPrevious}
            hasNext={catalog.hasNext}
            onPageChange={(page) => updateSearch({ page })}
            onPageSizeChange={(size) =>
              updateSearch({ size: size === 50 ? 50 : 20, page: 1 })
            }
          />
        </>
      )}
      <GoogleFeedBulkBar
        productCount={selectedProducts.size}
        variantCount={selectedVariantCount}
        variantSelectionCount={selectedVariants.size}
        categoryEnabled={readiness.category}
        genderEnabled={readiness.gender}
        ageGroupEnabled={readiness.ageGroup}
        busy={busy}
        onCategory={(value) =>
          void bulkProducts("google_product_category", value)
        }
        onGender={(value) => void bulkProducts("gender", value)}
        onAgeGroup={(value) => void bulkVariants(value)}
        onApplyRules={() => void applyRules()}
        onClear={clearSelection}
      />
    </GoogleFeedPageFrame>
  );
}

function catalogSelectionScopeKey(search: GoogleFeedCatalogSearch) {
  return [
    search.view,
    search.q ?? "",
    search.productType ?? "",
    search.collection ?? "",
    search.shopifyStatus ?? "",
    search.gender ?? "",
    search.ageGroup ?? "",
  ].join("\u0000");
}
