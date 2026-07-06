import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api, type Doc, type Id } from "@/lib/convex";
import {
  productFilterArgs,
  type ProductSearch,
} from "@/lib/productFilters";

import type { ProductFacets, ProductListItem, ProductPageResult } from "../types";
import { useImageTypeSelection } from "./useImageTypeSelection";

export function useProductsListPage(search: ProductSearch) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<Id<"products">>>(new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);

  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const {
    action,
    collection,
    generation,
    publish,
    q,
    review,
    shopifyStatus,
    status,
    type,
  } = search;
  const productListArgs = useMemo(
    () =>
      productFilterArgs({
        action,
        collection,
        generation,
        publish,
        q,
        review,
        shopifyStatus,
        status,
        type,
      }),
    [action, collection, generation, publish, q, review, shopifyStatus, status, type],
  );

  const productPage = useQuery(api.products.list, {
    ...productListArgs,
    offset,
    limit: pageSize,
  }) as ProductPageResult | undefined;
  const facets = useQuery(api.products.facets) as ProductFacets | undefined;
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const syncProducts = useAction(api.shopify.syncProducts);
  const createJob = useMutation(api.jobs.create);

  const products = useMemo(() => productPage?.page ?? [], [productPage?.page]);
  const imageTypes = useMemo(
    () => (prompts ?? []).filter((prompt) => prompt.isActive),
    [prompts],
  );
  const imageTypeSelection = useImageTypeSelection(imageTypes);
  const loaded = productPage !== undefined && facets !== undefined;
  const allVisibleSelected = products.length
    ? products.every((product) => selected.has(product._id))
    : false;
  const selectedProducts = useMemo(
    () => products.filter((product) => selected.has(product._id)),
    [products, selected],
  );

  function updateSearch(patch: Partial<ProductSearch>) {
    void navigate({
      to: "/products",
      search: { ...search, ...patch },
      replace: true,
    });
  }

  function updateFilters(patch: Partial<ProductSearch>) {
    updateSearch({ ...patch, page: undefined });
    setSelected(new Set());
  }

  function updatePage(nextPage: number) {
    updateSearch({ page: nextPage > 1 ? nextPage : undefined });
  }

  function updatePageSize(nextPageSize: number) {
    updateSearch({
      page: undefined,
      pageSize: nextPageSize === 20 ? undefined : nextPageSize,
    });
  }

  async function runSync() {
    setSyncing(true);
    try {
      await syncProducts({ limit: 1000 });
      toast.success("Shopify catalog synced");
    } catch (syncError) {
      toast.error("Sync failed", {
        description:
          syncError instanceof Error ? syncError.message : String(syncError),
      });
    } finally {
      setSyncing(false);
    }
  }

  function toggleProduct(productId: Id<"products">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleVisible() {
    const allSelected =
      products.length > 0 && products.every((product) => selected.has(product._id));

    setSelected((current) => {
      const next = new Set(current);
      products.forEach((product) => {
        if (allSelected) next.delete(product._id);
        else next.add(product._id);
      });
      return next;
    });
  }

  function openChooser() {
    imageTypeSelection.resetSelection();
    setChooserOpen(true);
  }

  function openChooserForProduct(product: ProductListItem) {
    imageTypeSelection.resetSelection();
    setSelected(new Set([product._id]));
    setChooserOpen(true);
  }

  async function generate() {
    if (!imageTypeSelection.selectedTypes.size) return;

    setCreatingJob(true);
    try {
      const jobId = await createJob({
        productIds: Array.from(selected),
        selectedImageTypes: Array.from(imageTypeSelection.selectedTypes),
        forceRegenerate: true,
      });
      setChooserOpen(false);
      setSelected(new Set());
      toast.success("Background generation started", {
        description: "Product states update here in real time.",
        action: {
          label: "View job",
          onClick: () =>
            void navigate({ to: "/jobs/$jobId", params: { jobId } }),
        },
      });
    } catch (jobError) {
      toast.error("Failed start generation", {
        description:
          jobError instanceof Error ? jobError.message : String(jobError),
      });
    } finally {
      setCreatingJob(false);
    }
  }

  return {
    allVisibleSelected,
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
  };
}
