import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Images } from "lucide-react";
import { EmptyState, NumberedPaginator, PageHeader, pageContentClass } from "@/components/page";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex";
import { useJobHistoryActions } from "../hooks/useJobHistoryActions";
import type { JobSearch } from "../lib/jobSearch";
import type { JobsPageResult } from "../types";
import { DeleteJobDialog } from "./DeleteJobDialog";
import { JobsCostSummary } from "./JobsCostSummary";
import { JobsFilters } from "./JobsFilters";
import { JobsList } from "./JobsList";

export function JobsPage({ search }: { search: JobSearch }) {
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const jobsPage = useQuery(api.jobs.list, {
    productId: search.productId as Id<"products"> | undefined,
    status: search.status,
    executionMode: search.executionMode,
    provider: search.provider,
    review: search.review,
    archived: search.archived,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  }) as JobsPageResult | undefined;
  const jobs = jobsPage?.page ?? [];
  const history = useJobHistoryActions({
    onRemoved: keepCurrentPageValid,
    onArchiveChanged: keepCurrentPageValid,
  });
  const hasFilters = Boolean(
    search.productId || search.status || search.executionMode || search.provider || search.review,
  );

  function updateSearch(next: JobSearch) {
    void navigate({ to: "/jobs", search: next, replace: true });
  }
  function updatePage(next: number) {
    updateSearch({ ...search, page: next > 1 ? next : undefined });
  }
  function keepCurrentPageValid() {
    if (jobs.length === 1 && page > 1) updatePage(page - 1);
  }

  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Générations"
        eyebrow="Production des images"
        action={
          <Button asChild>
            <Link to="/products">
              <Images />
              Choisir des produits
            </Link>
          </Button>
        }
      >
        Suivez les traitements, vérifiez leurs résultats et préparez leur publication.
      </PageHeader>
      <JobsFilters search={search} onChange={updateSearch} />
      {jobsPage === undefined ? (
        <EmptyState
          loading
          title="Chargement des générations"
          body="Lecture de l’historique de la boutique active."
        />
      ) : (
        <>
          <p role="status" className="mb-3 text-xs text-muted-foreground">
            {jobs.length} lot{jobs.length === 1 ? "" : "s"} sur cette page
            {search.archived ? " · Archives" : ""} · Une génération terminée peut encore contenir
            des images à vérifier.
          </p>
          {jobs.length ? (
            <JobsList jobs={jobs} search={search} history={history} />
          ) : (
            <EmptyState
              title={
                hasFilters
                  ? "Aucune génération ne correspond"
                  : search.archived
                    ? "Aucune génération archivée"
                    : "Votre première génération commence avec un produit"
              }
              body={
                hasFilters
                  ? "Modifiez les filtres pour retrouver un autre lot."
                  : search.archived
                    ? "Les générations que vous archivez restent consultables ici."
                    : "Choisissez des produits, puis les types d’images à générer."
              }
            >
              {hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    updateSearch({ archived: search.archived, pageSize: search.pageSize })
                  }
                >
                  Effacer les filtres
                </Button>
              ) : (
                !search.archived && (
                  <Button asChild>
                    <Link to="/products">Voir les produits</Link>
                  </Button>
                )
              )}
            </EmptyState>
          )}
          <NumberedPaginator
            page={page}
            pageSize={pageSize}
            hasPrevious={jobsPage.hasPrevious}
            hasNext={jobsPage.hasNext}
            loading={false}
            onPageChange={updatePage}
            onPageSizeChange={(size) =>
              updateSearch({ ...search, page: undefined, pageSize: size === 20 ? undefined : size })
            }
          />
        </>
      )}
      <div className="mt-6">
        <JobsCostSummary />
      </div>
      <DeleteJobDialog
        target={history.deleteTarget}
        busy={history.busyJobId !== null}
        onOpenChange={history.onDeleteOpenChange}
        onConfirm={() => void history.confirmRemoval()}
      />
    </main>
  );
}
