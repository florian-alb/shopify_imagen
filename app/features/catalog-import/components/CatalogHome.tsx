import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { PageHeader, pageContentClass } from "@/components/page";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogCreateForm } from "./CatalogCreateForm";
import { sourceScopeLabel } from "../lib/source-scope";
import type { SourceScope } from "../../../../convex/catalogue/scope";

type Summary = {
  id: string;
  origin: string;
  sourceScope?: SourceScope;
  mode: string;
  topN?: number;
  status: string;
  complete: number;
  total: number;
  updatedAt: number;
};
const labels: Record<string, string> = {
  working: "En cours",
  tags: "Tags à valider",
  ready: "Disponible",
  partial: "Partiel",
  blocked: "À relancer",
};
export function CatalogHome() {
  const raw = useQuery(api.catalogues.list),
    rows: Summary[] = raw ? JSON.parse(raw) : [];
  return (
    <main className={pageContentClass}>
      <PageHeader eyebrow="Catalogue" title="Imports">
        Récupérez le menu, les collections et les produits d’une boutique.
      </PageHeader>
      <CatalogCreateForm />
      <section className="mt-10 max-w-5xl">
        <h2 className="mb-4 text-lg font-semibold">Catalogues précédents</h2>
        {raw === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground">
            Vos catalogues apparaîtront ici après une première analyse.
          </p>
        ) : (
          <div className="studio-panel divide-y overflow-hidden">
            {rows.map((c) => (
              <Link
                key={c.id}
                to="/catalog-import/$exportId"
                params={{ exportId: c.id }}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div>
                  <p className="font-medium">{new URL(c.origin).hostname}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.mode === "ALL" ? "Tout le catalogue" : `Top ${c.topN}`} ·{" "}
                    {c.complete}/{c.total} fiches
                    {` · ${sourceScopeLabel(c.sourceScope)}`}
                  </p>
                </div>
                <span className="text-sm">{labels[c.status]}</span>
                <time className="text-sm text-muted-foreground">
                  {new Date(c.updatedAt).toLocaleString("fr-FR")}
                </time>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
