import { useState, useSyncExternalStore } from "react"
import { useAction } from "convex/react"
import { ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react"
import { api, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import type {
  Preparation,
  PreparedProduct,
} from "../../../../convex/catalogImport/model"
import {
  useCatalogProduct,
  useCatalogProducts,
} from "../hooks/use-catalog-data"
import { useCatalogNavigation } from "../hooks/use-catalog-query"
import { CatalogError, SourceStatus, Working } from "./CatalogShared"

export function CatalogProducts({
  op,
  prep,
  onSaved,
}: {
  op: Doc<"catalogOperations">
  prep: Preparation
  onSaved: () => void
}) {
  const [collection, setCollection] = useCatalogNavigation(
    `${op.ownerId}:${op._id}:collection`,
    "",
  )
  const [search, setSearch] = useCatalogNavigation(
    `${op.ownerId}:${op._id}:search`,
    "",
  )
  const [query, setQuery] = useCatalogNavigation(
    `${op.ownerId}:${op._id}:query`,
    "",
  )
  const [issues, setIssues] = useCatalogNavigation(
    `${op.ownerId}:${op._id}:issues`,
    false,
  )
  const [savedCursors, setCursors] = useCatalogNavigation<
    Array<string | undefined>
  >(`${op.ownerId}:${op._id}:${op.revision}:cursors`, [undefined])
  const [selected, setSelected] = useState<string | null>(null)
  const cursor = savedCursors[savedCursors.length - 1]
  const page = useCatalogProducts(op, {
    cursor,
    collection: collection || undefined,
    search: query || undefined,
    onlyIssues: issues,
  })
  const cursors =
    page.value && "reset" in page.value && page.value.reset
      ? [undefined]
      : savedCursors
  function changeCollection(key: string) {
    setCollection(key)
    setCursors([undefined])
    setSelected(null)
  }
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <h2 className="mb-3 text-sm font-semibold">Collections</h2>
        <select
          aria-label="Collection affichée"
          className="h-11 w-full rounded-md border bg-background px-3 xl:hidden"
          value={collection}
          onChange={(e) => changeCollection(e.target.value)}
        >
          <option value="">Tous les produits</option>
          {prep.collections
            .filter((c) => c.selected)
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.targetTitle}
              </option>
            ))}
        </select>
        <div className="hidden max-h-[70vh] space-y-1 overflow-y-auto xl:block">
          <Button
            variant={collection === "" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => changeCollection("")}
          >
            Tous les produits
          </Button>
          {prep.collections
            .filter((c) => c.selected)
            .map((c) => (
              <Button
                key={c.key}
                variant={collection === c.key ? "secondary" : "ghost"}
                className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
                onClick={() => changeCollection(c.key)}
              >
                {c.targetTitle}
              </Button>
            ))}
        </div>
      </aside>
      <div
        className={`grid min-w-0 gap-4 ${selected ? "2xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
      >
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setQuery(search)
                setCursors([undefined])
              }}
            >
              <Input
                aria-label="Rechercher un produit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titre du produit…"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Rechercher"
              >
                <Search className="size-4" />
              </Button>
            </form>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={issues}
                onChange={(e) => {
                  setIssues(e.target.checked)
                  setCursors([undefined])
                }}
              />
              À vérifier
            </label>
          </div>
          {"refreshing" in page && page.refreshing === true && (
            <p role="status" className="mb-2 text-xs text-muted-foreground">
              Actualisation…
            </p>
          )}
          {page.loading ? (
            <Working />
          ) : page.error ? (
            <CatalogError message={page.error} retry={page.reload} />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-3 font-medium">Produit</th>
                      <th className="hidden px-3 py-3 font-medium md:table-cell">
                        Tags
                      </th>
                      <th className="px-3 py-3 font-medium">Sources</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {page.value?.rows.map((row) => (
                      <tr
                        key={row.handle}
                        className={
                          selected === row.handle
                            ? "bg-accent"
                            : "hover:bg-muted/30"
                        }
                      >
                        <td className="p-3">
                          <button
                            data-catalog-product={row.handle}
                            className="flex w-full items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-primary"
                            onClick={() => setSelected(row.handle)}
                          >
                            {row.image ? (
                              <img
                                src={row.image}
                                alt=""
                                loading="lazy"
                                className="size-12 shrink-0 rounded-md bg-muted object-contain"
                              />
                            ) : (
                              <span className="size-12 shrink-0 rounded-md bg-muted" />
                            )}
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {row.title}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {row.variants} variantes ·{" "}
                                {row.collections.length} collections
                                {row.excluded
                                  ? " · Exclu"
                                  : row.reviewed
                                    ? " · Vérifié"
                                    : row.issues
                                      ? ` · ${row.issues} points à vérifier`
                                      : ""}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="hidden max-w-48 p-3 md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {row.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                            {row.tags.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{row.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-2">
                            <SourceStatus
                              label="JSON"
                              complete={row.jsonStatus === "complete"}
                            />
                            <SourceStatus
                              label="Page"
                              complete={row.htmlStatus === "complete"}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!page.value?.rows.length && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    {page.value?.cursor
                      ? "Aucun résultat dans cette tranche. Poursuivez la lecture pour rechercher les suivants."
                      : "Aucun produit ne correspond à cette sélection."}
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Page {cursors.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={cursors.length === 1}
                    onClick={() => setCursors(cursors.slice(0, -1))}
                  >
                    <ChevronLeft className="size-4" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!page.value?.cursor}
                    onClick={() =>
                      setCursors([...cursors, page.value!.cursor!])
                    }
                  >
                    Suivant
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        {selected && (
          <ProductInspector
            key={`${selected}:${op.revision}`}
            op={op}
            handle={selected}
            onClose={() => setSelected(null)}
            onSaved={() => {
              page.reload()
              onSaved()
            }}
          />
        )}
      </div>
    </div>
  )
}
const subscribeWide = (notify: () => void) => {
  const mq = window.matchMedia("(min-width: 1536px)")
  mq.addEventListener("change", notify)
  return () => mq.removeEventListener("change", notify)
}
function ProductInspector({
  op,
  handle,
  onClose,
  onSaved,
}: {
  op: Doc<"catalogOperations">
  handle: string
  onClose: () => void
  onSaved: () => void
}) {
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 1536px)").matches,
    () => false,
  )
  const data = useCatalogProduct(op, handle)
  const content = data.loading ? (
    <Working />
  ) : data.error ? (
    <CatalogError message={data.error} retry={data.reload} />
  ) : (
    data.value && (
      <ProductEditor product={data.value} op={op} onSaved={onSaved} />
    )
  )
  if (!wide)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <SheetContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document
              .querySelector<HTMLButtonElement>(
                `[data-catalog-product="${CSS.escape(handle)}"]`,
              )
              ?.focus()
          }}
          className="overflow-y-auto p-4"
          aria-describedby="product-inspector-description"
        >
          <SheetTitle className="pr-10">Fiche produit</SheetTitle>
          <SheetDescription id="product-inspector-description">
            Vérifiez les sources et préparez les tags.
          </SheetDescription>
          {content}
        </SheetContent>
      </Sheet>
    )
  return (
    <aside
      className="min-w-0 rounded-lg border p-4"
      aria-label="Détail du produit"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Fiche produit</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fermer la fiche"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {content}
    </aside>
  )
}
function ProductEditor({
  product,
  op,
  onSaved,
}: {
  product: PreparedProduct
  op: Doc<"catalogOperations">
  onSaved: () => void
}) {
  const [title, setTitle] = useState(product.title)
  const [tags, setTags] = useState(product.tags.join(", "))
  const [excluded, setExcluded] = useState(product.excluded)
  const [reviewed, setReviewed] = useState(product.reviewed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const save = useAction(api.catalogImportActions.saveProduct)
  const propose = useAction(api.catalogImportActions.proposeProduct)
  const retry = useAction(api.catalogImportActions.retryProduct)
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      {product.images[0] && (
        <img
          src={product.images[0].url}
          alt={product.images[0].alt || product.title}
          className="mx-auto h-52 w-full rounded-md bg-muted object-contain"
        />
      )}
      <label className="block space-y-1 text-sm">
        <span>Titre</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Tags validés en anglais</span>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="rabbit, large"
        />
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await propose({ id: op._id, handle: product.handle })
            setTags(result.tags.join(", "))
            setSuggestion(result.reason)
          })
        }
      >
        <Sparkles className="size-4" />
        Proposer des tags
      </Button>
      {suggestion && <p className="text-sm leading-6">{suggestion}</p>}
      {(product.errors.length > 0 || product.warnings.length > 0) && (
        <div className="rounded-md border bg-muted/30 p-3">
          <h3 className="text-sm font-medium">À vérifier</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            {[...product.errors, ...product.warnings].map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
          {product.errors.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() =>
                void run(() => retry({ id: op._id, handle: product.handle }))
              }
            >
              Relancer cette fiche
            </Button>
          )}
        </div>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Description et rubriques
        </summary>
        <div className="catalog-prose mt-3 space-y-4 text-sm leading-6">
          <div dangerouslySetInnerHTML={{ __html: product.description }} />
          {product.sections.map((s, i) => (
            <section key={i}>
              <h3 className="font-semibold">{s.title}</h3>
              <div dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          ))}
        </div>
      </details>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Variantes ({product.variants.length})
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {product.variants.map((v) => (
            <li key={v.id} className="flex justify-between gap-2">
              <span>{v.title}</span>
              <span>
                {v.price} {v.currency}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <a
        href={product.url}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-sm underline underline-offset-4"
      >
        Voir la fiche source
      </a>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
          className="size-4 accent-primary"
        />
        Informations vérifiées
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => setExcluded(e.target.checked)}
          className="size-4 accent-primary"
        />
        Exclure de l’import
      </label>
      {error && <CatalogError message={error} />}
      <Button
        className="w-full"
        disabled={busy || ["running", "queued"].includes(op.status)}
        onClick={() =>
          void run(async () => {
            await save({
              id: op._id,
              revision: op.revision,
              handle: product.handle,
              patch: {
                title,
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                excluded,
                reviewed,
              },
            })
            onSaved()
          })
        }
      >
        Enregistrer les corrections
      </Button>
    </div>
  )
}
