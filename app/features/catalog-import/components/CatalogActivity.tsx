import { useState } from "react"
import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Link } from "@tanstack/react-router"
import { api, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { CatalogError, Working } from "./CatalogShared"
import { phaseLabels } from "../lib/labels"
import { useCatalogRemote } from "../hooks/use-catalog-remote"

export function CatalogActivity({ op }: { op: Doc<"catalogOperations"> }) {
  const [status, setStatus] = useState<
    "failed" | "running" | "queued" | "done"
  >("failed")
  const tasks = usePaginatedQuery(
    api.catalogImport.activity,
    { id: op._id, status },
    { initialNumItems: 25 },
  )
  const control = useMutation(api.catalogImport.control)
  const [error, setError] = useState<string | null>(null)
  return (
    <section>
      {op.type === "import" && <ImportReport op={op} />}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold">Journal de l’opération</h2>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label="État des tâches"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="failed">Erreurs</option>
          <option value="running">En cours</option>
          <option value="queued">En attente</option>
          <option value="done">Terminées</option>
        </select>
      </div>
      {error && <CatalogError message={error} />}
      {tasks.status === "LoadingFirstPage" ? (
        <Working />
      ) : !tasks.results.length ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Aucune tâche dans cet état.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tasks.results.map((task) => (
            <li
              key={task._id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">
                  {phaseLabels[task.kind]} · {task.key}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(task.updatedAt).toLocaleString("fr-FR")} ·{" "}
                  {task.attempts} tentative(s)
                </p>
                {task.error && (
                  <p className="mt-2 max-w-3xl break-words text-sm">
                    {task.error}
                  </p>
                )}
              </div>
              {task.status === "failed" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void control({
                      id: op._id,
                      command: "retry",
                      taskId: task._id,
                    }).catch((e) => setError(String(e)))
                  }
                >
                  Relancer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {tasks.status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => tasks.loadMore(25)}
        >
          Afficher la suite
        </Button>
      )}
    </section>
  )
}

function ImportReport({ op }: { op: Doc<"catalogOperations"> }) {
  const read = useAction(api.catalogImportActions.importResults)
  const [cursor, setCursor] = useState<string | undefined>()
  const report = useCatalogRemote(
    () => read({ id: op._id, cursor }),
    `${op._id}:${op.status}:${cursor}:${op.done}:${op.failed}`,
  )
  return (
    <section className="mb-8 space-y-4">
      <h2 className="text-lg font-semibold">Bilan de l’import</h2>
      {op.sourceExportId && (
        <Link
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          to="/catalog-import/$exportId"
          params={{ exportId: op.sourceExportId }}
        >
          Revenir au catalogue pour corriger ou relancer un import
        </Link>
      )}
      {report.error && (
        <CatalogError message={report.error} retry={report.reload} />
      )}
      {report.value?.result && (
        <p className="text-sm leading-6">
          Menu créé : <strong>{report.value.result.menu.handle}</strong>.
          Produits en brouillon ; publication et affectation au thème à
          effectuer dans Shopify.
        </p>
      )}
      {report.value?.errors.length ? (
        <ul className="divide-y rounded-lg border">
          {report.value.errors.map((error) => (
            <li key={error.key} className="space-y-2 p-4 text-sm">
              <p className="break-all font-semibold">{error.handle}</p>
              <p className="max-w-3xl break-words leading-6">{error.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {report.value?.cursor && (
        <Button
          variant="outline"
          onClick={() => setCursor(report.value!.cursor!)}
        >
          Erreurs suivantes
        </Button>
      )}
    </section>
  )
}
