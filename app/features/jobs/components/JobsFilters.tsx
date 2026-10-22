import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/common/FilterSelect";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { JobSearch } from "../lib/jobSearch";
import { jobListView, jobViews, searchForJobView, type JobListView } from "../lib/jobListViews";

export function JobsFilters({
  search,
  onChange,
}: {
  search: JobSearch;
  onChange: (search: JobSearch) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const view = jobListView(search);
  const advancedCount = [
    search.productId,
    search.executionMode,
    search.provider,
    view === "custom",
  ].filter(Boolean).length;
  const hasFilters = Boolean(
    search.productId || search.status || search.review || search.provider || search.executionMode,
  );
  const update = (patch: Partial<JobSearch>) => onChange({ ...search, ...patch, page: undefined });
  return (
    <section aria-label="Vues et filtres des générations" className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="hidden flex-wrap gap-1 sm:flex"
          role="group"
          aria-label="Vue des générations"
        >
          {jobViews.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={view === item.value ? "secondary" : "ghost"}
              aria-pressed={view === item.value}
              onClick={() => onChange(searchForJobView(search, item.value))}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="min-w-0 flex-1 sm:hidden">
          <Select
            value={view}
            onValueChange={(value) => onChange(searchForJobView(search, value as JobListView))}
          >
            <SelectTrigger aria-label="Vue des générations" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view === "custom" && (
                <SelectItem value="custom" disabled>
                  Filtres personnalisés
                </SelectItem>
              )}
              {jobViews.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls="jobs-advanced-filters"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal />
          Filtres{advancedCount ? ` · ${advancedCount}` : ""}
        </Button>
      </div>
      {search.productId && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Générations d’un produit sélectionné
          <Button size="sm" variant="ghost" onClick={() => update({ productId: undefined })}>
            Voir tous les produits
          </Button>
        </p>
      )}
      {view === "custom" && (
        <p className="text-xs text-muted-foreground">
          Combinaison de filtres personnalisée{search.archived ? " · Archives" : ""}
        </p>
      )}
      {expanded && (
        <div
          id="jobs-advanced-filters"
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <FilterSelect
            value={search.status ?? "all"}
            placeholder="Statut de génération"
            onChange={(value) =>
              update({ status: value === "all" ? undefined : (value as JobSearch["status"]) })
            }
          >
            <SelectItem value="queued">En attente</SelectItem>
            <SelectItem value="running">En cours</SelectItem>
            <SelectItem value="completed">Terminée</SelectItem>
            <SelectItem value="failed">En échec</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </FilterSelect>
          <FilterSelect
            value={search.executionMode ?? "all"}
            placeholder="Mode d’exécution"
            onChange={(value) =>
              update({
                executionMode: value === "all" ? undefined : (value as JobSearch["executionMode"]),
              })
            }
          >
            <SelectItem value="realtime">Temps réel</SelectItem>
            <SelectItem value="batch">Batch</SelectItem>
          </FilterSelect>
          <FilterSelect
            value={search.review ?? "all"}
            placeholder="Vérification des images"
            onChange={(value) =>
              update({ review: value === "all" ? undefined : (value as JobSearch["review"]) })
            }
          >
            <SelectItem value="to-review">À vérifier</SelectItem>
            <SelectItem value="approved">Approuvées</SelectItem>
            <SelectItem value="partial">Partiellement approuvées</SelectItem>
            <SelectItem value="rejected">Rejetées</SelectItem>
            <SelectItem value="no-review">Aucune image à vérifier</SelectItem>
          </FilterSelect>
          <FilterSelect
            value={search.provider ?? "all"}
            placeholder="Fournisseur"
            onChange={(value) =>
              update({ provider: value === "all" ? undefined : (value as JobSearch["provider"]) })
            }
          >
            <SelectItem value="gemini">Nano Banana Pro</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
          </FilterSelect>
          <Button
            variant="outline"
            disabled={!hasFilters}
            onClick={() => onChange({ archived: search.archived, pageSize: search.pageSize })}
          >
            Effacer les filtres
          </Button>
        </div>
      )}
    </section>
  );
}
