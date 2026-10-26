import { Link } from "@tanstack/react-router"
import { useAction, useQuery } from "convex/react"
import { RotateCcw, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { StateBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, type Id } from "@/lib/convex"
import { attributeLabels } from "../constants"

export function GoogleFeedRunDetail({
  runId,
  onClose,
}: {
  runId: Id<"googleFeedRuns">
  onClose: () => void
}) {
  const details = useQuery(api.googleFeed.runDetails, { runId, limit: 300 })
  const publish = useAction(api.googleFeedActions.publish)
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    document.getElementById("google-feed-run-detail")?.scrollIntoView({ block: "start" })
  }, [runId])
  async function retry(runId: Id<"googleFeedRuns">) {
    setRetrying(true)
    try {
      const result = await publish({ retryRunId: runId })
      toast.success(`${result.published} valeurs publiées · ${result.failed} erreurs`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRetrying(false)
    }
  }
  return (
    <Card id="google-feed-run-detail" className="mt-4 scroll-mt-6 gap-0 overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Détail de l’exécution</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Anciennes valeurs, nouvelles valeurs et erreurs Shopify.
          </p>
        </div>
        <div className="flex gap-2">
          {details?.run.failedItems ? (
            <Button
              type="button"
              variant="outline"
              disabled={retrying}
              onClick={() => void retry(runId)}
            >
              <RotateCcw data-icon="inline-start" />
              {retrying ? "Relance…" : "Relancer les erreurs"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fermer le détail"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      {details === undefined ? (
        <p className="p-4 text-sm text-muted-foreground">Chargement du détail…</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Produit</TableHead>
                <TableHead>Attribut</TableHead>
                <TableHead>Avant</TableHead>
                <TableHead>Après</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Résultat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      to="/google-feed"
                      search={{
                        view:
                          item.status === "failed"
                            ? "errors"
                            : item.status === "conflict"
                              ? "review"
                              : "ready",
                        product: item.productId,
                      }}
                      className="text-primary hover:underline"
                    >
                      Ouvrir le produit
                    </Link>
                  </TableCell>
                  <TableCell>{attributeLabels[item.attribute]}</TableCell>
                  <TableCell>{item.oldValue ?? "vide"}</TableCell>
                  <TableCell>{item.newValue}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.sourceLabel}
                  </TableCell>
                  <TableCell>
                    {item.status === "confirmed" ? (
                      <StateBadge state="success">Confirmé</StateBadge>
                    ) : item.status === "failed" || item.status === "conflict" ? (
                      <div>
                        <StateBadge state="danger">Erreur</StateBadge>
                        {item.error ? (
                          <p className="mt-1 max-w-72 text-xs text-destructive">{item.error}</p>
                        ) : null}
                      </div>
                    ) : (
                      <StateBadge>{item.status}</StateBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
