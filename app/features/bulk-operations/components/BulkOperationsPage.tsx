import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Images } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader, pageContentClass } from "@/components/page";
import { Button } from "@/components/ui/button";
import { BulkImageReorderDialogs } from "@/features/products/components/BulkImageReorderDialogs";
import { BulkImageTransformDialogs } from "@/features/products/components/BulkImageTransformDialogs";
import { useBulkImageReorder } from "@/features/products/hooks/useBulkImageReorder";
import { useBulkImageTransform } from "@/features/products/hooks/useBulkImageTransform";
import { api, type Id } from "@/lib/convex";
import type { BulkHistoryCursor, ListedBulkOperation, OperationFilter } from "../types";
import type { BulkOperationSearch } from "../lib/bulkOperationSearch";
import { BulkOperationsList } from "./BulkOperationsList";

export function BulkOperationsPage({ search = {} }: { search?: BulkOperationSearch }) {
  const shopInfo = useQuery(api.settings.shopInfo);
  const shopKey =
    shopInfo === undefined ? "loading" : (shopInfo.shopId ?? shopInfo.domain ?? "no-shop");
  return (
    <BulkOperationsForShop
      key={`${shopKey}:${search.operation ?? "all"}`}
      search={search}
      destination={shopInfo?.domain ?? undefined}
    />
  );
}

function BulkOperationsForShop({
  search,
  destination,
}: {
  search: BulkOperationSearch;
  destination?: string;
}) {
  const navigate = useNavigate();
  const operation: OperationFilter = search.operation ?? "all";
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<BulkHistoryCursor[]>([null]);
  const jobsPage = useQuery(api.bulkOperations.list, {
    cursor: cursorStack[pageIndex] ?? null,
    limit: 20,
    operation,
  });
  const bulkTransform = useBulkImageTransform({
    onStarted: () => undefined,
    selectedProductIds: [],
  });
  const bulkReorder = useBulkImageReorder({ onStarted: () => undefined, selectedProductIds: [] });

  function nextPage() {
    const cursor = jobsPage?.continueCursor;
    if (!cursor) return;
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), cursor]);
    setPageIndex((current) => current + 1);
  }
  function openJob(job: ListedBulkOperation) {
    if (job.operation === "reorder_media") bulkReorder.openJob(job.id as Id<"bulkReorderJobs">);
    else bulkTransform.openJob(job.id as Id<"bulkTransformJobs">);
  }

  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Opérations groupées"
        eyebrow={destination ?? "Boutique active"}
        action={
          <Button asChild>
            <Link to="/products">
              <Images />
              Choisir des produits
            </Link>
          </Button>
        }
      >
        Suivez les changements de vos galeries Shopify, vérifiez les miroirs et retrouvez les
        possibilités de restauration.
      </PageHeader>
      <div role="group" aria-label="Type d’opération" className="mb-4 flex flex-wrap gap-1">
        {(
          [
            { value: "all", label: "Toutes" },
            { value: "reorder_media", label: "Réorganisations" },
            { value: "flip_horizontal", label: "Miroirs" },
          ] as const
        ).map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={operation === item.value ? "secondary" : "ghost"}
            aria-pressed={operation === item.value}
            onClick={() => {
              void navigate({
                to: "/bulk-operations",
                search: { operation: item.value === "all" ? undefined : item.value },
                replace: true,
              });
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {jobsPage === undefined ? (
        <EmptyState
          loading
          title="Chargement des opérations"
          body="Lecture de l’historique de la boutique active."
        />
      ) : jobsPage.page.length ? (
        <>
          <p role="status" className="mb-3 text-xs text-muted-foreground">
            {jobsPage.page.length} opération{jobsPage.page.length === 1 ? "" : "s"} sur cette page ·
            Ouvrez une opération pour vérifier ses résultats avant toute nouvelle action.
          </p>
          <BulkOperationsList jobs={jobsPage.page} onOpen={openJob} />
        </>
      ) : (
        <EmptyState
          title={
            operation === "all" ? "Aucune opération pour le moment" : "Aucune opération de ce type"
          }
          body="Depuis les produits, sélectionnez les galeries à réorganiser ou les images à transformer."
        >
          <Button asChild variant="outline">
            <Link to="/products">Voir les produits</Link>
          </Button>
        </EmptyState>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">Page {pageIndex + 1}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={pageIndex === 0 || jobsPage === undefined}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            Précédent
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={!jobsPage?.hasNext || !jobsPage.continueCursor}
            onClick={nextPage}
          >
            Suivant
          </Button>
        </div>
      </div>
      <BulkImageReorderDialogs bulkReorder={bulkReorder} />
      <BulkImageTransformDialogs bulkTransform={bulkTransform} />
    </main>
  );
}
