import { useQuery } from "convex/react"
import { useState } from "react"

import { EmptyState, StateBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, type Id } from "@/lib/convex"

import { readFeedReturnTo } from "../lib/workspace-search"
import { GoogleFeedRunDetail } from "./GoogleFeedRunDetail"
import { GoogleFeedPageFrame } from "./GoogleFeedPageFrame"

const PAGE_SIZE = 20

export function GoogleFeedHistoryPage({ returnTo }: { returnTo?: string }) {
  const [pageIndex, setPageIndex] = useState(0)
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const [selectedRunId, setSelectedRunId] = useState<Id<"googleFeedRuns"> | null>(null)
  const history = useQuery(api.googleFeed.history, {
    paginationOpts: { cursor: cursors[pageIndex] ?? null, numItems: PAGE_SIZE },
  })

  return (
    <GoogleFeedPageFrame active="history" backSearch={readFeedReturnTo(returnTo)}>
      {history === undefined ? (
        <EmptyState
          loading
          title="Chargement de l’historique"
          body="Lecture des évaluations et publications de la boutique active."
        />
      ) : history.page.length === 0 ? (
        <EmptyState
          title="Aucune exécution"
          body="Les évaluations de règles et publications apparaîtront ici avec leurs résultats détaillés."
        />
      ) : (
        <>
          <Card className="hidden overflow-x-auto rounded-lg lg:block">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Origine</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead>Réussites</TableHead>
                  <TableHead>Ignorées</TableHead>
                  <TableHead>Erreurs</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.page.map((run) => {
                  const processed =
                    run.succeededItems + run.failedItems + run.skippedItems + run.conflictItems
                  const percent = run.totalItems
                    ? Math.min(100, (processed / run.totalItems) * 100)
                    : 100
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {run.kind === "publication" ? "Publication" : "Évaluation"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {run.source === "rules"
                            ? "Règles"
                            : run.source === "retry"
                              ? "Relance"
                              : "Manuel"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <RunStatus status={run.status} />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-40 space-y-2">
                          {run.status === "running" ? null : <Progress value={percent} />}
                          <p className="text-xs text-muted-foreground">
                            {run.status === "running"
                              ? `${processed} traitées`
                              : `${processed}/${run.totalItems}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{run.succeededItems}</TableCell>
                      <TableCell>{run.skippedItems}</TableCell>
                      <TableCell>{run.failedItems + run.conflictItems}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRunId(run.id)
                          }}
                        >
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
          <div className="grid gap-3 lg:hidden">
            {history.page.map((run) => (
              <Card key={run.id} className="gap-4 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {run.kind === "publication" ? "Publication" : "Évaluation"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <RunStatus status={run.status} />
                </div>
                <p className="text-sm">
                  {run.succeededItems} réussies · {run.failedItems + run.conflictItems} erreurs ·{" "}
                  {run.skippedItems} ignorées
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedRunId(run.id)
                  }}
                >
                  Voir le détail
                </Button>
              </Card>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-xs text-muted-foreground">Page {pageIndex + 1}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
              >
                Précédent
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={history.isDone}
                onClick={() => {
                  setCursors((current) => [
                    ...current.slice(0, pageIndex + 1),
                    history.continueCursor,
                  ])
                  setPageIndex((page) => page + 1)
                }}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}

      {selectedRunId ? (
        <GoogleFeedRunDetail runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      ) : null}
    </GoogleFeedPageFrame>
  )
}

function RunStatus({ status }: { status: "running" | "completed" | "partial" | "failed" }) {
  return (
    <StateBadge
      state={
        status === "completed"
          ? "success"
          : status === "partial"
            ? "warning"
            : status === "failed"
              ? "danger"
              : "neutral"
      }
    >
      {status === "completed"
        ? "Terminée"
        : status === "partial"
          ? "Partielle"
          : status === "failed"
            ? "Échec"
            : "En cours"}
    </StateBadge>
  )
}
