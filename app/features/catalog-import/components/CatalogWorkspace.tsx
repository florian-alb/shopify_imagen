import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { ArrowLeft, Download, Pause, Play, RefreshCw } from "lucide-react"
import { api, type Id, type Doc } from "@/lib/convex"
import { PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { useCatalogStructure } from "../hooks/use-catalog-data"
import { CatalogError, OperationBadge, Working } from "./CatalogShared"
import { CatalogStructure } from "./CatalogStructure"
import { CatalogProducts } from "./CatalogProducts"
import { CatalogActivity } from "./CatalogActivity"
import { CatalogExportErrors } from "./CatalogExportErrors"
import { CatalogImportPanel } from "./CatalogImportPanel"
import { number, phaseLabels } from "../lib/labels"

type Tab = "structure" | "products" | "errors" | "activity" | "import"
export function CatalogWorkspace({ id }: { id: Id<"catalogOperations"> }) {
  const op = useQuery(api.catalogImport.get, { id })
  const structure = useCatalogStructure(op)
  const state = useQuery(api.catalogWorkspace.state, op ? { id } : "skip") as
    | Doc<"catalogWorkspaces">
    | null
    | undefined
  const retryClassification = useMutation(
    api.catalogWorkspace.retryClassification,
  )
  const control = useMutation(api.catalogImport.control)
  const finalize = useAction(api.catalogImportActions.finalize)
  const download = useAction(api.catalogImportActions.download)
  const [tab, setTab] = useState<Tab>("structure")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowPartial, setAllowPartial] = useState(false)
  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.")
    } finally {
      setBusy(false)
    }
  }
  if (!op)
    return (
      <main className={pageContentClass}>
        <Working />
      </main>
    )
  const running = ["running", "queued"].includes(op.status)
  const activeTab = op.type === "import" ? "activity" : tab
  return (
    <main className={pageContentClass}>
      <Link
        to="/catalog-import"
        className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Tous les exports
      </Link>
      <PageHeader
        title={`${new URL(op.origin).hostname}${op.rehearsal ? " · Catalogue de test" : ""}`}
        eyebrow={
          op.type === "import" ? "Import Shopify" : "Préparation du catalogue"
        }
        action={
          <>
            {running ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => control({ id, command: "pause" }))
                }
              >
                <Pause className="size-4" />
                Pause
              </Button>
            ) : ["paused", "interrupted", "cancelled"].includes(op.status) ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => control({ id, command: "resume" }))
                }
              >
                <Play className="size-4" />
                Reprendre
              </Button>
            ) : null}
            {["running", "queued", "paused", "interrupted"].includes(
              op.status,
            ) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => control({ id, command: "cancel" }))
                }
              >
                Arrêter
              </Button>
            )}
            {op.status === "partial" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => control({ id, command: "retry" }))
                }
              >
                <RefreshCw className="size-4" />
                Relancer les tâches échouées
              </Button>
            )}
            {op.finalKey && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const url = await download({ id })
                    window.location.assign(url)
                  })
                }
              >
                <Download className="size-4" />
                Télécharger le JSON
              </Button>
            )}
            {op.type === "export" &&
              !running &&
              op.total > 0 &&
              !op.finalKey && (
                <Button
                  disabled={
                    busy ||
                    ((op.failed > 0 || op.status === "partial") &&
                      !allowPartial)
                  }
                  onClick={() => void run(() => finalize({ id, allowPartial }))}
                >
                  Générer l’export
                </Button>
              )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <OperationBadge status={op.status} />
          <span>
            {number(op.done)} fiches complètes · {number(op.total)} découvertes
            · {number(op.failed)} incomplètes
          </span>
        </div>
      </PageHeader>
      {state?.pendingVersion !== undefined && (
        <p
          role="status"
          className="mb-4 rounded-md border bg-muted/30 p-3 text-sm"
        >
          Mise à jour des classements · {state.validated} produits traités. La
          dernière version cohérente reste affichée.
        </p>
      )}
      {state?.error && (
        <CatalogError
          message={state.error}
          retry={
            state.mode === "active"
              ? () => void run(() => retryClassification({ id }))
              : undefined
          }
        />
      )}
      {op.storageMode === "migration" && (
        <p role="status" className="mb-4 text-sm">
          Migration du catalogue en cours. La consultation reste disponible ;
          les modifications reprendront après validation.
        </p>
      )}
      {error && <CatalogError message={error} />}
      {op.error && <CatalogError message={op.error} />}
      {op.type === "export" && (op.failed > 0 || op.status === "partial") && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm">
            {op.failed > 0
              ? `${number(op.failed)} fiches incomplètes : consultez les causes avant de générer l’export.`
              : "Des tâches ont échoué : consultez le détail avant de générer l’export."}
          </p>
          <Button variant="outline" onClick={() => setTab("errors")}>
            Voir les erreurs
          </Button>
        </div>
      )}
      {running && (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 rounded-lg border bg-muted/30 px-4 py-3"
        >
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>{phaseLabels[op.phase] ?? op.phase}</span>
            <span className="text-muted-foreground">
              Vous pouvez fermer cette page, le traitement continue.
            </span>
          </div>
          <progress
            className="mt-3 h-1.5 w-full accent-primary"
            {...(op.total > 0
              ? {
                  value: op.done + op.failed,
                  max: Math.max(op.total, op.done + op.failed),
                }
              : {})}
            aria-label="Progression de la collecte"
          />
        </div>
      )}
      {!running &&
        (op.failed > 0 || op.status === "partial") &&
        op.type === "export" && (
          <label className="mb-5 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={allowPartial}
              onChange={(e) => setAllowPartial(e.target.checked)}
            />
            Autoriser un export partiel avec les erreurs signalées
          </label>
        )}
      {op.type === "import" && op.status === "completed" && (
        <p className="mb-6 rounded-lg border bg-muted/30 p-4 text-sm leading-6">
          Import terminé. Vérifiez les produits en brouillon dans Shopify, puis
          affectez le nouveau menu au thème et publiez les produits lorsque vous
          êtes prêt.
        </p>
      )}
      {op.type === "export" && (
        <nav
          aria-label="Étapes de préparation"
          className="mb-6 flex gap-5 overflow-x-auto border-b"
        >
          {(
            [
              ["structure", "Structure"],
              ["products", "Produits"],
              ["errors", "Erreurs"],
              ["activity", "Activité"],
              ["import", "Import Shopify"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={activeTab === key ? "page" : undefined}
              className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-medium transition-colors ${activeTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {activeTab === "errors" ? (
        <CatalogExportErrors op={op} />
      ) : activeTab === "activity" ? (
        <CatalogActivity op={op} />
      ) : structure.loading ? (
        <Working label="Lecture de la préparation…" />
      ) : structure.error ? (
        <CatalogError message={structure.error} retry={structure.reload} />
      ) : structure.value ? (
        <>
          {activeTab === "structure" && (
            <CatalogStructure
              key={`${op._id}:${op.revision}`}
              op={op}
              initial={structure.value}
              onSaved={structure.reload}
            />
          )}
          {activeTab === "products" && (
            <CatalogProducts
              op={op}
              prep={structure.value}
              onSaved={structure.reload}
            />
          )}
          {activeTab === "import" && (
            <CatalogImportPanel
              key={`${op._id}:${op.revision}`}
              op={op}
              prep={structure.value}
            />
          )}
        </>
      ) : (
        <Working label="Le menu sera disponible après la première lecture du site." />
      )}
    </main>
  )
}
