import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { ArrowRight, FolderInput, Plus } from "lucide-react"
import { api } from "@/lib/convex"
import { PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CatalogError, OperationBadge, Working } from "./CatalogShared"
import { number, phaseLabels } from "../lib/labels"
import { useCatalogRemote } from "../hooks/use-catalog-remote"

export function CatalogHome() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.catalogImport.list,
    {},
    { initialNumItems: 20 },
  )
  const create = useMutation(api.catalogImport.create)
  const configuration = useAction(api.catalogImportActions.configuration)
  const config = useCatalogRemote(() => configuration({}), "config")
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState("")
  const [mode, setMode] = useState<"menu" | "all">("menu")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function start(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await create({ url, mode })
      await navigate({
        to: "/catalog-import/$exportId",
        params: { exportId: id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Import de catalogue"
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            Nouvel export
          </Button>
        }
      >
        Récupérez une boutique Shopify, préparez ses collections et importez son
        catalogue.
      </PageHeader>
      {config.value && !config.value.storage && (
        <CatalogError
          message="Le stockage privé des catalogues n’est pas configuré. Renseignez CATALOG_R2_BUCKET et les identifiants R2 côté serveur avant de lancer une collecte."
          retry={config.reload}
        />
      )}
      {config.error && (
        <CatalogError message={config.error} retry={config.reload} />
      )}
      {(showForm || (status !== "LoadingFirstPage" && !results.length)) && (
        <section className="mb-6 max-w-3xl rounded-lg border p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <FolderInput className="mt-1 size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Commencer par le menu</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Nous analyserons la navigation. Vous choisirez ensuite les
                collections à récupérer.
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void start(event)} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="catalog-source" className="text-sm font-medium">
                Adresse de la boutique source
              </label>
              <Input
                id="catalog-source"
                type="url"
                required
                placeholder="https://www.kuscheltierland.de"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoComplete="url"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">
                Périmètre de découverte
              </legend>
              {(
                [
                  [
                    "menu",
                    "Collections du menu",
                    "Choisir les branches qui vous intéressent.",
                  ],
                  [
                    "all",
                    "Tout le catalogue public",
                    "Compléter le menu avec les produits du sitemap.",
                  ],
                ] as const
              ).map(([value, label, help]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3"
                >
                  <input
                    type="radio"
                    name="scope"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">
                      {help}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && <CatalogError message={error} />}
            <Button type="submit" disabled={busy || !config.value?.storage}>
              {busy ? "Lancement…" : "Analyser le menu"}
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </section>
      )}
      {status === "LoadingFirstPage" ? (
        <Working />
      ) : (
        results.length > 0 && (
          <section
            aria-label="Historique des opérations"
            className="overflow-hidden rounded-lg border"
          >
            <div className="grid grid-cols-[1fr_auto] gap-4 bg-muted/40 px-4 py-3 text-sm font-medium">
              <span>Opérations</span>
              <span>Progression</span>
            </div>
            {results.map((op) => (
              <Link
                key={op._id}
                to="/catalog-import/$exportId"
                params={{ exportId: op._id }}
                className="flex items-center justify-between gap-4 border-t px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {new URL(op.origin).hostname}
                    </span>
                    <OperationBadge status={op.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {op.type === "import" ? "Import Shopify" : "Export"} ·{" "}
                    {phaseLabels[op.phase] ?? op.phase} ·{" "}
                    {new Date(op.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <span>
                    {number(op.done)} / {number(op.total)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    produits
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )
      )}
      {status === "CanLoadMore" && (
        <Button className="mt-4" variant="outline" onClick={() => loadMore(20)}>
          Afficher la suite
        </Button>
      )}
    </main>
  )
}
