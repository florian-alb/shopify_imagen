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
import { CatalogCsvExport } from "./CatalogCsvExport"
import { CatalogTags } from "./CatalogTags"
import { CatalogCollections } from "./CatalogCollections"
import { CatalogMenu } from "./CatalogMenu"
import { CatalogImportResult } from "./CatalogImportResult"
import type { Catalogue } from "../types"
import { ImportConfirmation } from "./ImportConfirmation"
import type { TagLanguage } from "../../../../convex/catalogue/tags"
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
  type CatalogProduct,
  type ProductOverride,
  type RemoteResult,
} from "../../../../convex/catalogue/model"

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
    setTagLanguage = useMutation(api.catalogues.setTagLanguage),
    exportJson = useMutation(api.catalogues.exportJson),
    download = useAction(api.catalogueActions.download)
  const partial = !!(
      c.failed ||
      c.complete < c.total ||
      c.structure.warnings.length ||
      c.structure.collections.some((x) => !x.ignored && x.membership !== "complete")
    ),
    locked = !!c.work && (c.status === "working" || c.work.kind === "import"),
    tagsLocked = c.work?.kind === "import" || c.work?.kind === "export",
    editingTags = c.status === "tags" || tab === "tags"
  const changeLanguage = (language: TagLanguage) => run(() => setTagLanguage({
    id: c._id, language, tagVersion: c.tagVersion ?? 0,
  }))
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
    <main className="mx-auto min-w-0 max-w-[1680px] pb-8">
      <div className="px-4 pb-6 pt-6 md:px-6 md:pt-8 xl:px-8">
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
              {c.sourceCount > 0 && !(c.status === "working" && ["menu", "sitemap"].includes(c.phase)) && ` · ${c.sourceCount} produits sur la source`}
            </p>
          </div>
          {!editingTags && <div className="flex flex-wrap gap-2">
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
            <CatalogCsvExport
              id={c._id}
              origin={c.origin}
              version={c.version}
              generation={c.generation}
              total={c.total}
              partial={partial}
              disabled={locked || busy || !!c.work}
            />
            <Button
              disabled={
                locked || c.structure.collections.some((x) => !x.ignored && !x.validated)
              }
              onClick={() => setDialog("import")}
            >
              Importer vers Shopify
            </Button>
          </div>}
        </header>
        {c.work && (
          <div className="mt-4">
            <Notice>
              <strong>{phaseLabels[c.phase] ?? c.phase}</strong>
              {c.work.phase === "collect" &&
              c.structure.collections[c.work.collection ?? 0]
                ? ` · ${c.structure.collections[c.work.collection ?? 0].title}`
                : ""}
              <p>
                {c.complete} / {c.total || "…"} fiches complètes
                {c.failed ? ` · ${c.failed} en échec` : ""}
                {c.status === "blocked"
                  ? " · En attente de reprise"
                  : c.work.kind === "import"
                    ? " · Catalogue verrouillé pendant l’import"
                    : ""}
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
            Reprendre
          </Button>
        )}
        {!editingTags && tab === "products" && !locked && c.failed > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" role="status">
            <button className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => { setState("failed"); setTab("products") }}>
              {c.failed} {c.failed === 1 ? "fiche à relancer" : "fiches à relancer"}
            </button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => retry({ id: c._id }))}>Relancer</Button>
          </div>
        )}
        {!editingTags && c.lastImport && <CatalogImportResult result={c.lastImport} />}
      </div>
      {editingTags ? (
        <CatalogTags
          c={c}
          run={run}
          busy={busy || tagsLocked}
          changeLanguage={changeLanguage}
          done={() => setTab("collections")}
        />
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
            <CatalogCollections
              c={c}
              editTags={() => setTab("tags")}
              showProducts={(key) => { setCollection(key); setTab("products") }}
              run={run}
              busy={busy}
            />
          )}
          {tab === "menu" && (
            <CatalogMenu structure={c.structure} origin={c.origin}
              showCollection={(key) => { setCollection(key); setTab("products") }} />
          )}
        </>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialog === "export"
                ? "Exporter ce catalogue incomplet"
                : "Importer vers Shopify"}
            </DialogTitle>
            <DialogDescription>
              {c.total} produits · {c.structure.collections.length} collections
              {dialog === "export" && <> · {c.complete} fiches complètes</>}
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
                Générer le JSON partiel
              </Button>
            </>
          ) : dialog === "import" ? (
            <ImportConfirmation
              id={c._id}
              version={c.version}
              partial={partial}
              close={() => setDialog(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
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
  const collectionFilter = c.structure.collections.some((col) => col.key === collection && col.ignored) ? "" : collection
  useEffect(() => {
    if (selected) panel.current?.focus()
  }, [selected])
  const { results, status, loadMore } = usePaginatedQuery(
    api.catalogues.products,
    { id: c._id, search, collection: collectionFilter, state, sort },
    { initialNumItems: 25 },
  )
  const pageSize = 25,
    start = pageIndex * pageSize,
    end = start + pageSize,
    rows = results.slice(start, end).map((row) => decode<Row>(row)),
    hasNext = results.length > end,
    filling = status !== "Exhausted" && results.length <= end,
    collectionCount = collectionFilter
      ? c.structure.collections.find((col) => col.key === collectionFilter)
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
      className={`grid min-w-0 items-start gap-5 p-4 md:p-6 xl:px-8 ${selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(330px,38%)]" : "grid-cols-1"}`}
    >
      <section
        className={`min-w-0 ${selected ? "hidden lg:block" : ""}`}
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
            value={collectionFilter}
            onChange={(e) => {
              setCollection(e.target.value)
              reset()
            }}
          >
            <option value="">Toutes les collections</option>
            <option value="__none">Sans collection</option>
            {c.structure.collections.filter((col) => !col.ignored).map((col) => (
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
              <thead className="border-b text-muted-foreground">
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
                        <span className="[overflow-wrap:anywhere]">{row.title}</span>
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
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
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
                    {start + 1}–{start + rows.length} affichés ·{" "}
                  </>
                )}
                {collectionCount !== undefined ? `${collectionCount} dans cette collection` : `${c.total} dans le catalogue`}
                {filling && " · Chargement…"}
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
          className="studio-inspector min-w-0 outline-none lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
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
            Voir la source
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
        {p.state !== "complete" && <p className="mt-1 text-muted-foreground">
          {p.error || "Fiche en attente de collecte."}
        </p>}
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
                  ? "Aucun complément trouvé."
                  : "Lecture HTML en échec."}
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
              {new Date(c.rankedAt).toLocaleString("fr-FR")}
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
            Copier le JSON
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
