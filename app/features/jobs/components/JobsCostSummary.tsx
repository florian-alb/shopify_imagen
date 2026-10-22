import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/convex";
import { formatUsd } from "@/lib/formatters";

export function JobsCostSummary() {
  const [open, setOpen] = useState(false);
  const cost = useQuery(api.jobs.costSummary, open ? {} : "skip");
  return (
    <details
      className="group rounded-xl border bg-card"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Coûts de la boutique{" "}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t p-4">
        <p className="text-sm text-muted-foreground">
          Cumul enregistré pour la boutique active, toutes dates et archives comprises. Les filtres
          de cette liste ne modifient pas ces montants.
        </p>
        {!cost ? (
          <p role="status">Chargement des coûts…</p>
        ) : (
          <dl className="grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Total enregistré</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatUsd(cost.totalCost)}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                {(cost.inputTokens + cost.outputTokens).toLocaleString("fr-FR")} tokens ·{" "}
                {cost.pricedImageCount} images chiffrées
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Génération d’images</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatUsd(cost.generationCost)}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                Temps réel : {formatUsd(cost.realtimeGenerationCost)} · {cost.realtimeImageCount}{" "}
                images
                <br />
                Batch : {formatUsd(cost.batchGenerationCost)} · {cost.batchImageCount} images
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Analyse visuelle</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatUsd(cost.analysisCost)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </details>
  );
}
