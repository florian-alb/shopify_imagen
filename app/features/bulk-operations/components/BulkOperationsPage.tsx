import { Link } from "@tanstack/react-router";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Images } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkImageTransformDialogs } from "@/features/products/components/BulkImageTransformDialogs";
import { useBulkImageTransform } from "@/features/products/hooks/useBulkImageTransform";
import {
  bulkTransformImagePositionsLabel,
  bulkTransformStatusLabel,
} from "@/features/products/lib/bulkImageTransformViewModel";
import { api } from "@/lib/convex";

type ListedBulkOperation = NonNullable<
  FunctionReturnType<typeof api.bulkTransforms.list>
>["page"][number];
type BulkHistoryCursor = FunctionArgs<typeof api.bulkTransforms.list>["cursor"];

const BULK_HISTORY_PAGE_SIZE = 20;

function statusTone(job: ListedBulkOperation) {
  if (job.rollbackStatus === "completed") return "success" as const;
  if (job.rollbackStatus === "running" || job.rollbackStatus === "partial") {
    return "warning" as const;
  }
  if (job.status === "completed") return "success" as const;
  if (job.status === "failed" || job.status === "cancelled") {
    return "danger" as const;
  }
  return "warning" as const;
}

function operationStatusLabel(job: ListedBulkOperation) {
  if (job.rollbackStatus === "running") return "Restauration";
  if (job.rollbackStatus === "completed") return "Originaux restaurés";
  if (job.rollbackStatus === "partial") return "Restauration avec alertes";
  return bulkTransformStatusLabel(job.status);
}

function operationProgress(job: ListedBulkOperation) {
  if (job.rollbackStatus) {
    const completed =
      job.rolledBackItems + job.rollbackFailedItems + job.rollbackConflictItems;
    const total = job.rollbackTotalItems ?? job.publishedItems;
    return {
      completed,
      total,
      label: `${completed}/${total} images restaurées ou vérifiées`,
    };
  }
  if (job.status === "queued") {
    return {
      completed: job.seededProductCount,
      total: job.productCount,
      label: `${job.seededProductCount}/${job.productCount} produits inventoriés`,
    };
  }
  const publishing =
    job.status === "publishing" ||
    job.status === "completed" ||
    job.status === "partial";
  const completed = publishing
    ? job.publishedItems + job.publishFailedItems + job.conflictItems
    : job.transformedItems + job.transformFailedItems + job.unsupportedItems;
  const total = publishing ? job.transformedItems : job.totalItems;
  return {
    completed,
    total,
    label: `${completed}/${total} images`,
  };
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
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<BulkHistoryCursor[]>([null]);
  const cursor = cursorStack[pageIndex] ?? null;
  const jobsPage = useQuery(api.bulkTransforms.list, {
    cursor,
    limit: BULK_HISTORY_PAGE_SIZE,
  });
  const bulkTransform = useBulkImageTransform({
    onStarted: () => undefined,
    selectedProductIds: [],
  });

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
        Suivi en temps réel des préparations, publications, conflits et
        résultats archivés.
      </PageHeader>

      {jobsPage === undefined ? (
        <EmptyState
          loading
          title="Chargement des bulks"
          body="Lecture de l’historique de la boutique active."
        />
      ) : jobsPage.page.length === 0 ? (
        <EmptyState
          title="Aucune opération bulk"
          body="Sélectionne des produits pour préparer ta première transformation en masse."
        >
          <Button asChild>
            <Link to="/products">Voir les produits</Link>
          </Button>
        </EmptyState>
      ) : (
        <Card className="overflow-hidden rounded-lg">
          <Table className="min-w-[940px] [&_td]:h-20 [&_th]:text-[0.72rem] [&_th]:font-medium [&_th]:text-muted-foreground">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                const progress = operationProgress(job);
                const percent = progress.total
                  ? Math.min(100, (progress.completed / progress.total) * 100)
                  : 0;
                const failures =
                  job.seedFailedProducts +
                  job.transformFailedItems +
                  job.publishFailedItems +
                  job.conflictItems +
                  job.skippedItems +
                  job.unsupportedItems;
                const rollbackFailures =
                  job.rollbackFailedItems + job.rollbackConflictItems;
                const resultSummary = job.error
                  ? job.error
                  : job.rollbackStatus && rollbackFailures
                    ? `${rollbackFailures} restauration${rollbackFailures === 1 ? "" : "s"} en échec ou conflit`
                    : job.rollbackStatus === "completed"
                      ? "Toutes les images éligibles ont été restaurées"
                      : failures
                        ? `${failures} élément${failures === 1 ? "" : "s"} non traité${failures === 1 ? "" : "s"}`
                        : "Aucune erreur";
                return (
                  <TableRow key={job._id}>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StateBadge state={statusTone(job)}>
                          {operationStatusLabel(job)}
                        </StateBadge>
                        {job.dismissedAt ? (
                          <StateBadge>Archivé</StateBadge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {job.productCount} produit
                        {job.productCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {bulkTransformImagePositionsLabel(
                          job.selectedImagePositions,
                        )}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-44 space-y-2">
                        <Progress
                          value={percent}
                          aria-label={`Progression du bulk ${job._id.slice(-6)}`}
                          aria-valuetext={progress.label}
                        />
                        <p className="text-xs text-muted-foreground">
                          {progress.label}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {job.transformedItems} préparées · {job.publishedItems}{" "}
                        publiées
                        {job.rollbackStatus
                          ? ` · ${job.rolledBackItems} restaurées`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resultSummary}
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
                        onClick={() => bulkTransform.openJob(job._id)}
                      >
                        {job.status === "queued" ||
                        job.status === "transforming" ||
                        job.status === "ready" ||
                        job.status === "publishing" ||
                        job.rollbackStatus === "running"
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
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Page {pageIndex + 1}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pageIndex === 0 || jobsPage === undefined}
            onClick={goToPreviousPage}
          >
            Précédent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!jobsPage?.hasNext || !jobsPage.continueCursor}
            onClick={goToNextPage}
          >
            Suivant
          </Button>
        </div>
      </div>

      <BulkImageTransformDialogs bulkTransform={bulkTransform} />
    </main>
  );
}
