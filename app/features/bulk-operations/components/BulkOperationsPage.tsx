import { Link } from "@tanstack/react-router";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { ArrowLeftRight, FlipHorizontal2, Images } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  PageHeader,
  StateBadge,
  pageContentClass,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkImageReorderDialogs } from "@/features/products/components/BulkImageReorderDialogs";
import { BulkImageTransformDialogs } from "@/features/products/components/BulkImageTransformDialogs";
import { useBulkImageReorder } from "@/features/products/hooks/useBulkImageReorder";
import { useBulkImageTransform } from "@/features/products/hooks/useBulkImageTransform";
import { bulkReorderStatusLabel } from "@/features/products/lib/bulkImageReorderViewModel";
import { bulkTransformStatusLabel } from "@/features/products/lib/bulkImageTransformViewModel";
import { api, type Doc, type Id } from "@/lib/convex";

type ListedBulkOperation = NonNullable<
  FunctionReturnType<typeof api.bulkOperations.list>
>["page"][number];
type BulkHistoryCursor = FunctionArgs<
  typeof api.bulkOperations.list
>["cursor"];
type OperationFilter = NonNullable<
  FunctionArgs<typeof api.bulkOperations.list>["operation"]
>;

const BULK_HISTORY_PAGE_SIZE = 20;
const operationFilters: SegmentedControlOption<OperationFilter>[] = [
  { label: "Toutes", value: "all" },
  {
    label: "Réorganisation",
    value: "reorder_media",
    icon: <ArrowLeftRight />,
  },
  {
    label: "Miroir",
    value: "flip_horizontal",
    icon: <FlipHorizontal2 />,
  },
];

function statusTone(job: ListedBulkOperation) {
  if (job.restoreStatus === "completed") return "success" as const;
  if (
    job.restoreStatus === "running" ||
    job.restoreStatus === "queued" ||
    job.restoreStatus === "partial"
  ) {
    return "warning" as const;
  }
  if (job.status === "completed") return "success" as const;
  if (job.status === "failed" || job.status === "cancelled") {
    return "danger" as const;
  }
  return "warning" as const;
}

function operationStatusLabel(job: ListedBulkOperation) {
  if (job.restoreStatus === "queued") return "Restauration en attente";
  if (job.restoreStatus === "running") return "Restauration en cours";
  if (job.restoreStatus === "completed") return "Original restauré";
  if (job.restoreStatus === "partial") return "Restauration avec alertes";
  return job.operation === "reorder_media"
    ? bulkReorderStatusLabel(
        job.status as Doc<"bulkReorderJobs">["status"],
      )
    : bulkTransformStatusLabel(
        job.status as Doc<"bulkTransformJobs">["status"],
      );
}

function operationLabel(job: ListedBulkOperation) {
  return job.operation === "reorder_media"
    ? `Positions ${job.details.firstPosition} ↔ ${job.details.secondPosition}`
    : job.details.selectedImagePositions?.length
      ? `${job.details.selectedImagePositions.length} position${job.details.selectedImagePositions.length === 1 ? "" : "s"}`
      : "Toutes les images";
}

function resultSummary(job: ListedBulkOperation) {
  if (job.details.error) return job.details.error;
  if (job.restoreStatus === "completed") {
    return "Aucun conflit de restauration";
  }
  if (job.restoreIssueItems) {
    return `${job.restoreIssueItems} restauration${job.restoreIssueItems === 1 ? "" : "s"} en échec ou conflit`;
  }
  if (job.issueItems) {
    return `${job.issueItems} élément${job.issueItems === 1 ? "" : "s"} ignoré${job.issueItems === 1 ? "" : "s"}, en échec ou conflit`;
  }
  if (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "transforming" ||
    job.status === "ready" ||
    job.status === "publishing" ||
    job.restoreStatus === "queued" ||
    job.restoreStatus === "running"
  ) {
    return "Traitement en cours";
  }
  return "Aucune erreur";
}

function progressLabel(job: ListedBulkOperation) {
  if (job.restoreStatus) {
    return `${job.processedItems}/${job.totalItems} élément${job.totalItems === 1 ? "" : "s"} restauré${job.processedItems === 1 ? "" : "s"} ou vérifié${job.processedItems === 1 ? "" : "s"}`;
  }
  if (job.operation === "reorder_media") {
    return `${job.processedItems}/${job.totalItems} produits vérifiés`;
  }
  if (job.status === "queued") {
    return `${job.processedItems}/${job.totalItems} produits inventoriés`;
  }
  if (job.status === "publishing") {
    return `${job.processedItems}/${job.totalItems} images publiées ou vérifiées`;
  }
  return `${job.processedItems}/${job.totalItems} images préparées ou vérifiées`;
}

function completionLabel(job: ListedBulkOperation) {
  if (job.restoreStatus) {
    return `${job.restoredItems ?? 0} restauré${(job.restoredItems ?? 0) === 1 ? "" : "s"}`;
  }
  if (job.operation === "reorder_media") {
    return `${job.completedItems} galerie${job.completedItems === 1 ? " réorganisée" : "s réorganisées"}`;
  }
  const completed =
    job.status === "publishing" ||
    job.status === "completed" ||
    job.status === "partial"
      ? job.details.publishedItems
      : job.details.transformedItems;
  return `${completed} image${completed === 1 ? "" : "s"} ${job.status === "publishing" || job.status === "completed" || job.status === "partial" ? "publiée" : "préparée"}${completed === 1 ? "" : "s"}`;
}

export function BulkOperationsPage() {
  const shopInfo = useQuery(api.settings.shopInfo);
  const shopKey =
    shopInfo === undefined
      ? "loading"
      : (shopInfo.shopId ?? shopInfo.domain ?? "no-shop");
  return <BulkOperationsForShop key={shopKey} />;
}

function BulkOperationsForShop() {
  const [operation, setOperation] = useState<OperationFilter>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<BulkHistoryCursor[]>([null]);
  const cursor = cursorStack[pageIndex] ?? null;
  const jobsPage = useQuery(api.bulkOperations.list, {
    cursor,
    limit: BULK_HISTORY_PAGE_SIZE,
    operation,
  });
  const bulkTransform = useBulkImageTransform({
    onStarted: () => undefined,
    selectedProductIds: [],
  });
  const bulkReorder = useBulkImageReorder({
    onStarted: () => undefined,
    selectedProductIds: [],
  });

  function changeOperation(next: string) {
    setOperation(next as OperationFilter);
    setPageIndex(0);
    setCursorStack([null]);
  }

  function goToPreviousPage() {
    setPageIndex((current) => Math.max(0, current - 1));
  }

  function goToNextPage() {
    const nextCursor = jobsPage?.continueCursor;
    if (!nextCursor) return;
    setCursorStack((current) => [
      ...current.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((current) => current + 1);
  }

  function openJob(job: ListedBulkOperation) {
    if (job.operation === "reorder_media") {
      bulkReorder.openJob(job.id as Id<"bulkReorderJobs">);
    } else {
      bulkTransform.openJob(job.id as Id<"bulkTransformJobs">);
    }
  }

  return (
    <main className={pageContentClass}>
      <PageHeader
        eyebrow={
          jobsPage
            ? `${jobsPage.page.length} opérations visibles`
            : "Historique des opérations"
        }
        title="Bulk operations"
        action={
          <Button asChild>
            <Link to="/products">
              <Images data-icon="inline-start" />
              Choisir des produits
            </Link>
          </Button>
        }
      >
        Réorganisations, préparations miroir, publications et conflits de la
        boutique active.
      </PageHeader>

      <div className="space-y-4">
        <SegmentedControl
          className="sm:w-[22rem]"
          value={operation}
          onValueChange={changeOperation}
          options={operationFilters}
          ariaLabel="Filtrer les opérations bulk"
        />

      {jobsPage === undefined ? (
        <EmptyState
          loading
          title="Chargement des bulks"
          body="Lecture de l’historique de la boutique active."
        />
      ) : jobsPage.page.length === 0 ? (
        <EmptyState
          title="Aucune opération bulk"
          body="Sélectionnez des produits pour lancer une réorganisation ou préparer des miroirs."
        >
          <Button asChild>
            <Link to="/products">Voir les produits</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {jobsPage.page.map((job) => (
              <BulkOperationCard
                key={job.key}
                job={job}
                onOpen={() => openJob(job)}
              />
            ))}
          </div>
          <Card className="hidden overflow-hidden rounded-lg lg:block">
          <Table className="min-w-[1020px] [&_td]:h-20 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Opération</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Cible</TableHead>
                <TableHead>Progression</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead>Créée</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobsPage.page.map((job) => {
                const percent = job.totalItems
                  ? Math.min(
                      100,
                      (job.processedItems / job.totalItems) * 100,
                    )
                  : 0;
                return (
                  <TableRow key={job.key}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {job.operation === "reorder_media" ? (
                          <ArrowLeftRight className="size-4" />
                        ) : (
                          <FlipHorizontal2 className="size-4" />
                        )}
                        {job.operation === "reorder_media"
                          ? "Réorganisation"
                          : "Miroir horizontal"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StateBadge state={statusTone(job)}>
                          {operationStatusLabel(job)}
                        </StateBadge>
                        {job.dismissedAt ? <StateBadge>Archivé</StateBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {job.productCount} produit
                        {job.productCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {operationLabel(job)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-44 space-y-2">
                        <Progress
                          value={percent}
                          aria-label={`Progression du bulk ${job.key.slice(-6)}`}
                          aria-valuetext={progressLabel(job)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {progressLabel(job)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal break-words">
                      <p className="text-sm">
                        {completionLabel(job)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resultSummary(job)}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openJob(job)}
                      >
                        {job.status === "queued" ||
                        job.status === "running" ||
                        job.status === "transforming" ||
                        job.status === "ready" ||
                        job.status === "publishing" ||
                        job.restoreStatus === "running"
                          ? "Suivre"
                          : "Voir"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Card>
        </>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Page {pageIndex + 1}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-7"
            disabled={pageIndex === 0 || jobsPage === undefined}
            onClick={goToPreviousPage}
          >
            Précédent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-7"
            disabled={!jobsPage?.hasNext || !jobsPage.continueCursor}
            onClick={goToNextPage}
          >
            Suivant
          </Button>
        </div>
      </div>
      </div>

      <BulkImageReorderDialogs bulkReorder={bulkReorder} />
      <BulkImageTransformDialogs bulkTransform={bulkTransform} />
    </main>
  );
}

function BulkOperationCard({
  job,
  onOpen,
}: {
  job: ListedBulkOperation;
  onOpen: () => void;
}) {
  const percent = job.totalItems
    ? Math.min(100, (job.processedItems / job.totalItems) * 100)
    : 0;
  return (
    <Card size="sm" className="gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            {job.operation === "reorder_media" ? (
              <ArrowLeftRight className="size-4" />
            ) : (
              <FlipHorizontal2 className="size-4" />
            )}
            {job.operation === "reorder_media"
              ? "Réorganisation"
              : "Miroir horizontal"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {job.productCount} produit{job.productCount === 1 ? "" : "s"} · {operationLabel(job)}
          </p>
        </div>
        <StateBadge state={statusTone(job)}>
          {operationStatusLabel(job)}
        </StateBadge>
      </div>
      <div className="space-y-2">
        <Progress
          value={percent}
          aria-label={`Progression du bulk ${job.key.slice(-6)}`}
          aria-valuetext={progressLabel(job)}
        />
        <p className="text-xs text-muted-foreground">{progressLabel(job)}</p>
      </div>
      <div className="min-w-0 text-sm">
        <p>{completionLabel(job)}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {resultSummary(job)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <time className="text-xs text-muted-foreground" dateTime={new Date(job.createdAt).toISOString()}>
          {new Date(job.createdAt).toLocaleString("fr-FR")}
        </time>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          onClick={onOpen}
        >
          Voir le détail
        </Button>
      </div>
    </Card>
  );
}
