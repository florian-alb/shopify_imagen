import { useState, useRef, useEffect, type ReactNode } from "react"
import {
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
} from "convex/react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { api, type Id, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  decode,
  phaseLabels,
  type Structure,
  type Work,
  type CatalogProduct,
  type ProductOverride,
  type RemoteResult,
} from "../../../../convex/catalogue/model"

type Catalogue = Omit<
  Doc<"catalogues">,
  "structure" | "work" | "lastImport"
> & {
  structure: Structure
  work: Work | null
  lastImport: {
    domain: string
    menuId: string
    complete: number
    failed: number
    skipped: number
    created: number
    existing: number
  } | null
}
type Row = {
  id: Id<"produits">
  title: string
  rank: number | null
  collections: string[]
  state: string
  image?: string
  error?: string
  tags: string[]
  remote: RemoteResult | null
}
type Product = Omit<Doc<"produits">, "data" | "override" | "remote"> & {
  data:
    | (CatalogProduct & {
        tags: string[]
        excluded: boolean
        reviewed: boolean
      })
    | null
  sourceDefaults: { title: string; tags: string[] } | null
  override: ProductOverride
  remote: RemoteResult | null
}
const selectClass =
  "h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
const stateLabel = (state: string) =>
  state === "complete"
    ? "Complète"
    : state === "failed"
      ? "À relancer"
      : "À récupérer"
function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-md border bg-muted/30 px-4 py-3 text-sm leading-6"
      role="status"
    >
      {children}
    </div>
  )
}
export function CatalogWorkspace({ id }: { id: Id<"catalogues"> }) {
  const raw = useQuery(api.catalogues.get, { id })
  if (!raw)
    return (
      <div className="p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="mt-6 h-80 w-full" />
      </div>
    )
  return <Workspace key={id} c={decode<Catalogue>(raw)} />
}
function Workspace({ c }: { c: Catalogue }) {
  const [tab, setTab] = useState("products"),
    [collection, setCollection] = useState(""),
    [state, setState] = useState(""),
    [dialog, setDialog] = useState<"export" | "import" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const retry = useMutation(api.catalogues.retry),
    exportJson = useMutation(api.catalogues.exportJson),
    download = useAction(api.catalogueActions.download)
  const partial = !!(
      c.failed ||
      c.complete < c.total ||
      c.structure.warnings.length ||
      c.structure.collections.some((x) => x.membership !== "complete")
    ),
    outside = c.structure.collections.filter((x) => x.outsideMenu).length,
    locked = !!c.work && (c.status === "working" || c.work.kind === "import")
  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opération impossible.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="min-w-0">
      <div className="px-4 pb-4 pt-4 md:px-6">
        <Link
          to="/catalog-import"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tous les catalogues
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {new URL(c.origin).hostname.replace(/^www\./, "")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.mode === "ALL" ? "Tout le catalogue" : `Top ${c.topN}`}
              {c.initialCount > 0 && c.total > c.initialCount
                ? ` + ${c.total - c.initialCount} produits ajoutés`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={locked || busy}
              onClick={() => {
                if (c.exportVersion === c.version)
                  void run(async () => {
                    const a = document.createElement("a")
                    a.href = await download({ id: c._id })
                    a.rel = "noopener"
                    a.click()
                  })
                else if (partial) setDialog("export")
                else
                  void run(() => exportJson({ id: c._id, allowPartial: false }))
              }}
            >
              {c.work?.kind === "export"
                ? "Génération du fichier…"
                : c.exportVersion === c.version
                  ? "Télécharger le JSON"
                  : c.exportKey
                    ? "Régénérer le JSON"
                    : "Exporter JSON"}
            </Button>
            <Button
              disabled={
                locked || c.structure.collections.some((x) => !x.validated)
              }
              onClick={() => setDialog("import")}
            >
              Préparer l’import Shopify
            </Button>
          </div>
        </header>
        <p className="mt-4 text-xs text-muted-foreground">
          Source → Tags → Catalogue
        </p>
        {c.work && (
          <div className="mt-4">
            <Notice>
              <strong>{phaseLabels[c.phase] ?? c.phase}</strong>
              {c.work.phase === "collect" &&
              c.structure.collections[c.work.collection ?? 0]
                ? ` · ${c.structure.collections[c.work.collection ?? 0].title}`
                : ""}
              <p>
                {c.complete} fiches réussies sur{" "}
                {c.total || "un nombre en cours de vérification"}
                {c.failed ? ` · ${c.failed} en échec` : ""}.{" "}
                {c.status === "blocked"
                  ? "Le traitement attend votre relance ; les réussites sont conservées."
                  : c.work.kind === "import"
                    ? "Le catalogue est figé pendant l’import."
                    : "Vous pouvez fermer cette page ; le traitement continue."}
              </p>
            </Notice>
          </div>
        )}
        {(error || c.error) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error || c.error}
          </p>
        )}
        {(c.status === "blocked" || c.resumeWork) && (
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => retry({ id: c._id }))}
          >
            Reprendre l’étape en échec
          </Button>
        )}
        {!locked && c.failed > 0 && (
          <div className="mt-4">
            <Notice>
              {c.failed} fiches restent incomplètes.{" "}
              <button
                className="underline underline-offset-4"
                onClick={() => {
                  setState("failed")
                  setTab("products")
                }}
              >
                Voir les produits concernés
              </button>
              <Button
                className="ml-3"
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => retry({ id: c._id }))}
              >
                Relancer les produits en échec
              </Button>
            </Notice>
          </div>
        )}
        {c.lastImport && (
          <div className="mt-4">
            <Notice>
              Import traité vers {c.lastImport.domain} : {c.lastImport.complete}{" "}
              réussites ({c.lastImport.created} créations,{" "}
              {c.lastImport.existing} produits existants), {c.lastImport.failed}{" "}
              échecs, {c.lastImport.skipped} fiches non importées. Consultez le
              résultat de chaque fiche. Produits créés en brouillon ; menu non
              affecté au thème.
            </Notice>
          </div>
        )}
      </div>
      {c.status === "tags" || tab === "tags" ? (
        <div>
          {c.status !== "tags" && (
            <Button
              variant="ghost"
              className="ml-6"
              onClick={() => setTab("collections")}
            >
              Retour aux collections
            </Button>
          )}
          <Tags
            c={c}
            run={run}
            busy={busy || locked}
            done={() => setTab("collections")}
          />
        </div>
      ) : (
        <>
          <nav
            className="flex gap-1 overflow-x-auto border-b px-4 md:px-6"
            aria-label="Vues du catalogue"
          >
            {[
              ["products", `Produits (${c.total})`],
              [
                "collections",
                `Collections (${c.structure.collections.length})`,
              ],
              ["menu", "Menu"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                {key === "collections" && outside > 0 && (
                  <Badge variant="secondary">{outside} hors menu</Badge>
                )}
              </button>
            ))}
          </nav>
          {tab === "products" && (
            <Products
              key={`${c._id}:${collection}:${state}`}
              c={c}
              collection={collection}
              setCollection={setCollection}
              state={state}
              setState={setState}
            />
          )}
          {tab === "collections" && (
            <div>
              <Button
                variant="outline"
                className="ml-6 mt-5"
                disabled={locked}
                onClick={() => setTab("tags")}
              >
                Modifier et valider les tags
              </Button>
              <Collections
                c={c}
                showProducts={(key) => {
                  setCollection(key)
                  setTab("products")
                }}
                run={run}
                busy={busy}
              />
            </div>
          )}
          {tab === "menu" && (
            <div className="max-w-3xl space-y-8 p-6">
              <MenuTree
                nodes={c.structure.menu}
                showCollection={(key) => {
                  setCollection(key)
                  setTab("products")
                }}
              />
              <section>
                <h2 className="mb-3 font-semibold">
                  Collections hors menu ({outside})
                </h2>
                <div className="flex flex-wrap gap-2">
                  {c.structure.collections
                    .filter((x) => x.outsideMenu)
                    .map((x) => (
                      <Button
                        key={x.key}
                        variant="outline"
                        onClick={() => {
                          setCollection(x.key)
                          setTab("products")
                        }}
                      >
                        {x.title}
                      </Button>
                    ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialog === "export"
                ? "Exporter ce catalogue incomplet"
                : "Préparer l’import Shopify"}
            </DialogTitle>
            <DialogDescription>
              {c.total} produits · {c.structure.collections.length} collections
              · {c.complete} fiches complètes
            </DialogDescription>
          </DialogHeader>
          {dialog === "export" ? (
            <>
              <p className="text-sm">
                Le JSON conservera les données disponibles, les erreurs et les
                informations manquantes.
              </p>
              <ul className="list-disc pl-5 text-sm">
                <li>{c.total - c.complete} fiches incomplètes</li>
                {c.structure.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await exportJson({ id: c._id, allowPartial: true })
                    setDialog(null)
                  })
                }
              >
                J’accepte le caractère partiel — Générer le JSON
              </Button>
            </>
          ) : dialog === "import" ? (
            <ImportConfirmation
              c={c}
              partial={partial}
              close={() => setDialog(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  )
}
function Tags({
  c,
  run,
  busy,
  done,
}: {
  c: Catalogue
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
  done: () => void
}) {
  const [draft, setDraft] = useState(() =>
      c.structure.collections.map((x) => ({ ...x })),
    ),
    [search, setSearch] = useState("")
  const editVersion = useRef(c.version)
  const save = useMutation(api.catalogues.saveTags),
    suggest = useAction(api.catalogueActions.suggestTags)
  const invalid = draft.some(
    (x) =>
      !/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/.test(x.tag) ||
      x.tag.length > 100 ||
      draft.filter((y) => y.tag === x.tag).length > 1,
  )
  return (
    <section className="px-4 py-6 md:px-6">
      <h2 className="text-lg font-semibold">Validez les tags proposés</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Un tag anglais distinct par collection. Votre validation crée les règles
        ; l’IA propose seulement.
      </p>
      <div className="my-5 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label="Rechercher une collection"
          placeholder="Rechercher une collection"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const proposals = await suggest({ id: c._id })
              setDraft((previous) =>
                previous.map((col) =>
                  col.edited || col.validated
                    ? col
                    : {
                        ...col,
                        tag:
                          proposals.find((p) => p.key === col.key)?.tag ??
                          col.tag,
                      },
                ),
              )
            })
          }
        >
          Proposer des tags par IA
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3">Collection</th>
              <th className="p-3">Tag anglais</th>
              <th className="p-3">Sélection / Source</th>
              <th className="p-3">Menu</th>
            </tr>
          </thead>
          <tbody>
            {draft
              .filter((x) =>
                x.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((col) => (
                <tr key={col.key} className="border-b">
                  <td className="p-3">{col.title}</td>
                  <td className="p-3">
                    <Input
                      aria-label={`Tag de ${col.title}`}
                      aria-invalid={
                        !/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/.test(col.tag) ||
                        col.tag.length > 100 ||
                        draft.filter((x) => x.tag === col.tag).length > 1
                      }
                      value={col.tag}
                      onChange={(e) =>
                        setDraft((previous) =>
                          previous.map((x) =>
                            x.key === col.key
                              ? {
                                  ...x,
                                  tag: e.target.value,
                                  edited: true,
                                  validated: false,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <span className="mt-1 block text-xs">
                      {!/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/.test(col.tag) ||
                      col.tag.length > 100 ||
                      draft.filter((x) => x.tag === col.tag).length > 1
                        ? "À corriger — tag vide, invalide ou déjà utilisé"
                        : col.validated
                          ? "Validé"
                          : "À valider"}
                    </span>
                  </td>
                  <td className="p-3">
                    {col.selectedCount} /{" "}
                    {col.membership === "complete" ? col.count : "Non vérifié"}
                  </td>
                  <td className="p-3">
                    {col.outsideMenu ? "Hors menu" : "Présente"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save({
                id: c._id,
                version: editVersion.current,
                values: draft.map(({ key, tag }) => ({ key, tag })),
                validate: false,
                collect: false,
              })
              editVersion.current++
            })
          }
        >
          Enregistrer les corrections
        </Button>
        <Button
          disabled={busy || invalid}
          onClick={() =>
            void run(async () => {
              await save({
                id: c._id,
                version: editVersion.current,
                values: draft.map(({ key, tag }) => ({ key, tag })),
                validate: true,
                collect: true,
              })
              done()
            })
          }
        >
          Valider les {draft.length} tags et collecter
        </Button>
        {invalid && (
          <p className="text-sm text-muted-foreground">
            Corrigez les tags vides, invalides ou identiques avant de continuer.
          </p>
        )}
      </div>
    </section>
  )
}
function Products({
  c,
  collection,
  setCollection,
  state,
  setState,
}: {
  c: Catalogue
  collection: string
  setCollection: (x: string) => void
  state: string
  setState: (x: string) => void
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState<"rank" | "title" | "state">("rank"),
    [pageIndex, setPageIndex] = useState(0),
    [selected, setSelected] = useState<Id<"produits"> | null>(null),
    returnFocus = useRef<HTMLButtonElement | null>(null),
    panel = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (selected) panel.current?.focus()
  }, [selected])
  const { results, status, loadMore } = usePaginatedQuery(
    api.catalogues.products,
    { id: c._id, search, collection, state, sort },
    { initialNumItems: 25 },
  )
  const pageSize = 25,
    start = pageIndex * pageSize,
    end = start + pageSize,
    rows = results.slice(start, end).map((row) => decode<Row>(row)),
    hasNext = results.length > end,
    filling = status !== "Exhausted" && results.length <= end,
    collectionCount = collection
      ? c.structure.collections.find((col) => col.key === collection)
          ?.selectedCount
      : undefined,
    position = rows.findIndex((x) => x.id === selected)
  // Fill a display page with matches, including across nonempty sparse batches.
  // One lookahead match avoids sending the user to an empty last page. Convex
  // retains reactive batches and resets them when filters/sort change.
  useEffect(() => {
    if (status === "CanLoadMore" && results.length <= end) loadMore(pageSize)
  }, [status, results.length, end, loadMore])
  const reset = () => {
    setPageIndex(0)
    setSelected(null)
  }
  return (
    <div
      className={`grid min-w-0 ${selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(330px,38%)]" : "grid-cols-1"}`}
    >
      <section
        className={`min-w-0 p-4 md:p-6 ${selected ? "hidden lg:block" : ""}`}
      >
        <div className="mb-5 flex flex-wrap gap-2">
          <Input
            className="min-w-40 flex-1"
            aria-label="Rechercher un produit"
            placeholder="Rechercher un produit"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              reset()
            }}
          />
          <select
            className={selectClass}
            aria-label="Filtrer par collection"
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value)
              reset()
            }}
          >
            <option value="">Toutes les collections</option>
            <option value="__none">Sans collection</option>
            {c.structure.collections.map((col) => (
              <option value={col.key} key={col.key}>
                {col.title}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            aria-label="État des fiches"
            value={state}
            onChange={(e) => {
              setState(e.target.value)
              reset()
            }}
          >
            <option value="">Tous les états</option>
            <option value="complete">Complètes</option>
            <option value="failed">À relancer</option>
            <option value="pending">À récupérer</option>
          </select>
          <select
            className={selectClass}
            aria-label="Trier les produits"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort)
              reset()
            }}
          >
            <option value="rank">Meilleures ventes</option>
            <option value="title">Nom</option>
            <option value="state">État</option>
          </select>
        </div>
        {status === "LoadingFirstPage" ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead className="border-y text-muted-foreground">
                <tr>
                  <th className="px-2 py-3 font-normal">Rang</th>
                  <th className="px-2 py-3 font-normal">Produit</th>
                  <th className="hidden px-2 py-3 font-normal xl:table-cell">
                    Collections
                  </th>
                  <th className="px-2 py-3 font-normal">Fiche</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b transition-colors hover:bg-muted/50 ${selected === row.id ? "bg-muted" : ""}`}
                  >
                    <td className="p-2 tabular-nums">{row.rank ?? "—"}</td>
                    <td className="p-2">
                      <button
                        className="flex items-center gap-3 text-left font-medium focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={(e) => {
                          returnFocus.current = e.currentTarget
                          setSelected(row.id)
                        }}
                      >
                        {row.image && (
                          <img
                            src={row.image}
                            alt=""
                            className="size-12 rounded border object-contain"
                            loading="lazy"
                          />
                        )}
                        <span>{row.title}</span>
                      </button>
                    </td>
                    <td className="hidden p-2 xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {row.collections.map((key) => (
                          <Badge variant="secondary" key={key}>
                            {c.structure.collections.find((x) => x.key === key)
                              ?.title ?? key}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-2">
                        {row.state === "complete" && (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                        {stateLabel(row.state)}
                      </span>
                      {row.remote && (
                        <span className="mt-1 block text-xs">
                          Import :{" "}
                          {row.remote.status === "complete"
                            ? row.remote.created
                              ? "créé"
                              : "retrouvé"
                            : row.remote.status === "failed"
                              ? "en échec"
                              : "vérification"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="py-8 text-sm text-muted-foreground">
                {status === "Exhausted"
                  ? "Aucun produit correspondant."
                  : "Recherche dans les produits suivants…"}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {rows.length > 0 && (
                  <>
                    Produits {start + 1}–{start + rows.length} ·{" "}
                  </>
                )}
                {collectionCount !== undefined && (
                  <>{collectionCount} dans cette collection · </>
                )}
                {c.total} dans le catalogue ·{" "}
                {c.status === "working" && ["menu", "sitemap"].includes(c.phase)
                  ? "En cours"
                  : c.sourceCount}{" "}
                sur la source
                {filling && " · Chargement des résultats…"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageIndex === 0}
                  onClick={() => {
                    setPageIndex((x) => x - 1)
                    setSelected(null)
                  }}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => {
                    setPageIndex((x) => x + 1)
                    setSelected(null)
                  }}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      {selected && (
        <aside
          ref={panel}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelected(null)
              requestAnimationFrame(() => returnFocus.current?.focus())
            }
          }}
          className="min-w-0 border-l p-4 md:p-6"
          aria-label="Fiche produit"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold">Fiche produit</h2>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Produit précédent"
                disabled={position <= 0}
                onClick={() => setSelected(rows[position - 1].id)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Produit suivant"
                disabled={position < 0 || position >= rows.length - 1}
                onClick={() => setSelected(rows[position + 1].id)}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fermer la fiche"
                onClick={() => {
                  setSelected(null)
                  requestAnimationFrame(() => returnFocus.current?.focus())
                }}
              >
                <X />
              </Button>
            </div>
          </div>
          <Inspector key={selected} c={c} id={selected} />
        </aside>
      )}
    </div>
  )
}
function Inspector({ c, id }: { c: Catalogue; id: Id<"produits"> }) {
  const raw = useQuery(api.catalogues.product, { id: c._id, productId: id })
  return raw ? (
    <Detail c={c} p={decode<Product>(raw)} />
  ) : (
    <Skeleton className="h-80 w-full" />
  )
}
function Detail({ c, p }: { c: Catalogue; p: Product }) {
  const d = p.data,
    save = useMutation(api.catalogues.saveProduct)
  const editVersion = useRef(c.version)
  const [tagText, setTagText] = useState(""),
    [tagsTouched, setTagsTouched] = useState(false)
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<ProductOverride>(p.override),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-start gap-4">
        {d?.images[0] && (
          <img
            className="h-24 w-28 object-contain"
            src={d.images[0].url}
            alt={d.images[0].alt || p.title}
          />
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">{p.title}</h3>
          <a
            className="mt-2 inline-block underline underline-offset-4"
            href={p.url}
            target="_blank"
            rel="noreferrer"
          >
            Voir sur la boutique source
          </a>
        </div>
      </div>
      <div className="border-y py-3">
        <p className="font-medium">
          {p.state === "complete"
            ? "Fiche complète"
            : d?.jsonStatus === "complete" && d.htmlStatus !== "complete"
              ? "Compléments HTML manquants"
              : stateLabel(p.state)}
        </p>
        <p className="mt-1 text-muted-foreground">
          {p.state === "complete"
            ? "Description et compléments récupérés"
            : p.error || "La fiche sera disponible après la collecte."}
        </p>
      </div>
      <section>
        <h4 className="mb-2 font-semibold">Collections et tags</h4>
        <p>
          {p.collections
            .map(
              (k) =>
                c.structure.collections.find((x) => x.key === k)?.title ?? k,
            )
            .join(", ") || "Sans collection"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {d?.tags.map((t) => (
            <Badge variant="secondary" key={t}>
              {t}
            </Badge>
          ))}
        </div>
      </section>
      {d && (
        <>
          <section>
            <h4 className="mb-2 font-semibold">Description</h4>
            <div
              className="max-h-48 overflow-auto break-words"
              dangerouslySetInnerHTML={{ __html: d.description }}
            />
          </section>
          <details className="border-y py-3">
            <summary className="cursor-pointer font-semibold">
              Variantes ({d.variants.length})
            </summary>
            <div className="mt-3 space-y-2">
              {d.variants.map((v) => (
                <p key={v.id}>
                  {v.title} · {v.price} {v.currency} {v.sku && `· ${v.sku}`}
                </p>
              ))}
            </div>
          </details>
          <section>
            <h4 className="mb-2 font-semibold">Informations complémentaires</h4>
            {d.sections.map((section, i) => (
              <details
                key={`${section.title}-${i}`}
                open={section.title.toLowerCase() === "produktdetails"}
                className="border-b py-3"
              >
                <summary className="cursor-pointer font-medium">
                  {section.title}
                </summary>
                <div
                  className="mt-3 break-words"
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </details>
            ))}
            {!d.sections.length && (
              <p className="text-muted-foreground">
                {d.htmlStatus === "complete"
                  ? "HTML lu ; aucune rubrique complémentaire reconnue. Vérifiez le contenu sur la source."
                  : "Compléments indisponibles : la lecture HTML a échoué."}
              </p>
            )}
          </section>
        </>
      )}
      <details className="border-b py-3">
        <summary className="cursor-pointer underline underline-offset-4">
          Sources et JSON original
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            JSON : {d?.jsonStatus ?? "À récupérer"} · HTML :{" "}
            {d?.htmlStatus ?? "À récupérer"}
          </p>
          {d && (
            <p>
              Lu le {new Date(d.fetchedAt).toLocaleString("fr-FR")}
              {d.contentLanguage ? ` · Langue : ${d.contentLanguage}` : ""}
            </p>
          )}
          {c.rankedAt && (
            <p>
              Classement observé le{" "}
              {new Date(c.rankedAt).toLocaleString("fr-FR")}. Aucun chiffre de
              vente fourni.
            </p>
          )}
          {d?.warnings.map((x) => (
            <p key={x}>{x}</p>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={!p.jsonSource}
            onClick={() =>
              void navigator.clipboard
                .writeText(p.jsonSource ?? "")
                .catch(() => setError("Copie impossible."))
            }
          >
            Copier le JSON intégral
          </Button>
          <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
            {p.jsonSource
              ? JSON.stringify(JSON.parse(p.jsonSource), null, 2)
              : "JSON indisponible"}
          </pre>
        </div>
      </details>
      {p.remote && (
        <Notice>
          Import :{" "}
          {p.remote.status === "complete"
            ? p.remote.created
              ? "Produit créé en brouillon"
              : "Produit existant retrouvé"
            : (p.remote.error ?? "Vérification en cours")}
        </Notice>
      )}
      <Button
        variant="outline"
        disabled={!!c.work || !d}
        onClick={() => {
          setDraft(p.override)
          setTagText((d?.tags ?? []).join(", "))
          setTagsTouched(false)
          editVersion.current = c.version
          setEditing((x) => !x)
        }}
      >
        Corriger la fiche
      </Button>
      {editing && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError("")
            try {
              await save({
                id: c._id,
                productId: p._id,
                version: editVersion.current,
                override: tagsTouched
                  ? {
                      ...draft,
                      tags: tagText
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    }
                  : draft,
              })
              setEditing(false)
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Enregistrement impossible.",
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="grid gap-1">
            Titre
            <Input
              value={draft.title ?? p.sourceDefaults?.title ?? d?.title ?? ""}
              onChange={(e) =>
                setDraft((x) => ({ ...x, title: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1">
            Tags manuels, séparés par une virgule
            <Input
              value={tagText}
              onChange={(e) => {
                setTagText(e.target.value)
                setTagsTouched(true)
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Les tags manuels remplacent les tags hérités pour cette fiche.
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.excluded ?? false}
              onChange={(e) =>
                setDraft((x) => ({ ...x, excluded: e.target.checked }))
              }
            />
            Exclure de l’import Shopify
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !!c.work}>Enregistrer</Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setDraft({})
                setTagText((p.sourceDefaults?.tags ?? []).join(", "))
                setTagsTouched(false)
              }}
            >
              Revenir aux valeurs source
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
function Collections({
  c,
  showProducts,
  run,
  busy,
}: {
  c: Catalogue
  showProducts: (key: string) => void
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
}) {
  const [filter, setFilter] = useState("all"),
    [adding, setAdding] = useState<string | null>(null),
    add = useMutation(api.catalogues.addCollection)
  return (
    <section className="p-4 md:p-6">
      <select
        className={selectClass}
        aria-label="Filtrer les collections"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">Toutes</option>
        <option value="empty">Vides dans ce catalogue</option>
        <option value="outside">Hors menu</option>
        <option value="failed">À relancer</option>
      </select>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y text-muted-foreground">
            <tr>
              {[
                "Collection",
                "Tag",
                "Catalogue / Source",
                "Menu",
                "État",
                "Action",
              ].map((x) => (
                <th key={x} className="p-3 font-normal">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.structure.collections
              .filter(
                (x) =>
                  filter === "all" ||
                  (filter === "empty" &&
                    !x.selectedCount &&
                    x.membership === "complete") ||
                  (filter === "outside" && x.outsideMenu) ||
                  (filter === "failed" && x.membership === "failed"),
              )
              .map((col) => (
                <tr className="border-b" key={col.key}>
                  <td className="p-3 font-medium">{col.title}</td>
                  <td className="p-3">{col.tag || "À valider"}</td>
                  <td className="p-3">
                    <button
                      className="underline underline-offset-4"
                      onClick={() => showProducts(col.key)}
                    >
                      {col.selectedCount}
                    </button>{" "}
                    /{" "}
                    {col.membership === "complete" ? col.count : "Non vérifié"}
                  </td>
                  <td className="p-3">
                    {col.outsideMenu ? "Hors menu" : "Présente"}
                  </td>
                  <td className="p-3">
                    {col.membership !== "complete"
                      ? "Appartenances non vérifiées"
                      : col.selectedCount === 0
                        ? "Aucun produit sélectionné — collection conservée"
                        : "Appartenances vérifiées"}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!c.work || busy}
                      onClick={() => setAdding(col.key)}
                    >
                      Ajouter les produits manquants
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter les produits de cette collection</DialogTitle>
            <DialogDescription>
              Les produits manquants s’ajouteront à la sélection initiale, sans
              doublon.{" "}
              {c.mode === "TOP_N"
                ? `Le catalogue pourra dépasser ${c.topN} produits.`
                : "Les fiches réussies seront conservées."}
            </DialogDescription>
          </DialogHeader>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await add({ id: c._id, key: adding! })
                setAdding(null)
              })
            }
          >
            Ajouter les produits manquants
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
function MenuTree({
  nodes,
  showCollection,
}: {
  nodes: Structure["menu"]
  showCollection: (key: string) => void
}) {
  return (
    <ul className="space-y-2">
      {nodes.map((n) => (
        <li key={n.key}>
          {n.children.length ? (
            <details open className="rounded border p-3">
              <summary className="cursor-pointer font-medium">
                {n.title}
                {!n.url && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Regroupement
                  </span>
                )}
              </summary>
              <div className="pl-4 pt-3">
                {n.url && (
                  <Button
                    variant="link"
                    onClick={() =>
                      showCollection(
                        decodeURIComponent(
                          new URL(n.url!).pathname.split("/")[2],
                        ),
                      )
                    }
                  >
                    Voir la collection
                  </Button>
                )}
                <MenuTree nodes={n.children} showCollection={showCollection} />
              </div>
            </details>
          ) : n.url ? (
            <Button
              variant="link"
              onClick={() =>
                showCollection(
                  decodeURIComponent(new URL(n.url!).pathname.split("/")[2]),
                )
              }
            >
              {n.title}
            </Button>
          ) : (
            n.title
          )}
        </li>
      ))}
    </ul>
  )
}
function ImportConfirmation({
  c,
  partial,
  close,
}: {
  c: Catalogue
  partial: boolean
  close: () => void
}) {
  const raw = useQuery(api.catalogues.destinationShops),
    shops: Array<{ id: Id<"shops">; name?: string; domain: string }> = raw
      ? decode(raw)
      : [],
    start = useMutation(api.catalogues.startImport)
  const [shopId, setShopId] = useState(""),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  return (
    <div className="space-y-4">
      <label className="grid gap-2 text-sm">
        Boutique de destination
        <select
          className={selectClass}
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
        >
          <option value="">Choisir une boutique</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.domain} · {s.domain}
            </option>
          ))}
        </select>
      </label>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>
          Toutes les collections, y compris vides, avec une règle par tag.
        </li>
        <li>
          {c.complete} fiches complètes ; exclusions manuelles respectées.{" "}
          {c.total - c.complete} fiches incomplètes exclues.
        </li>
        <li>Créations et objets existants : à vérifier lors de l’import.</li>
        <li>Produits créés en brouillon. Tags manuels existants conservés.</li>
        <li>
          Menu séparé, non affecté au thème. Aucune publication automatique.
        </li>
      </ul>
      {partial && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          J’accepte d’importer ce catalogue incomplet.
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm font-medium">
        Destination :{" "}
        {shops.find((s) => s.id === shopId)?.domain ?? "Non choisie"}
      </p>
      <Button
        disabled={!shopId || (partial && !accepted) || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await start({
              id: c._id,
              shopId: shopId as Id<"shops">,
              allowPartial: accepted,
              version: c.version,
            })
            close()
          } catch (e) {
            setError(e instanceof Error ? e.message : "Import impossible.")
          } finally {
            setBusy(false)
          }
        }}
      >
        Confirmer l’import
      </Button>
    </div>
  )
}
