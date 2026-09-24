import { useState } from "react"
import { useAction } from "convex/react"
import { api, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { useCatalogRemote } from "../hooks/use-catalog-remote"
import { CatalogError, SourceStatus, Working } from "./CatalogShared"
import { CatalogActivity } from "./CatalogActivity"

export function CatalogExportErrors({ op }: { op: Doc<"catalogOperations"> }) {
  const read = useAction(api.catalogImportActions.products)
  const retry = useAction(api.catalogImportActions.retryProduct)
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cursor = cursors[cursors.length - 1]
  const page = useCatalogRemote(
    () => read({ id: op._id, cursor, onlyErrors: true }),
    `${op._id}:${op.status}:${op.done}:${op.failed}:${cursor}`,
    Boolean(op.preparationKey),
  )
  const running = ["running", "queued"].includes(op.status)
  async function retryProduct(handle: string) {
    setPending(handle)
    setError(null)
    try {
      await retry({ id: op._id, handle })
      page.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Relance impossible.")
    } finally {
      setPending(null)
    }
  }
  return (
    <div className="space-y-8">
      <section aria-labelledby="catalog-product-errors" className="space-y-4">
        <div>
          <h2 id="catalog-product-errors" className="text-lg font-semibold">
            Fiches incomplètes ({op.failed})
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Chaque fiche indique la source en échec et son message d’erreur. La
            relance conserve les données déjà récupérées.
          </p>
        </div>
        {running && (
          <p role="status" className="text-sm">
            Traitement en cours. Les relances seront disponibles à la fin du lot
            ou après une pause.
          </p>
        )}
        {error && <CatalogError message={error} />}
        {page.error && (
          <CatalogError message={page.error} retry={page.reload} />
        )}
        {page.loading ? (
          <Working label="Lecture des erreurs produit…" />
        ) : (
          page.value && (
            <>
              {page.value.rows.length ? (
                <ul className="divide-y rounded-lg border">
                  {page.value.rows.map((row) => (
                    <li key={row.handle} className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-medium">
                            {row.title || row.handle}
                          </h3>
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center text-sm underline underline-offset-4"
                          >
                            Voir la fiche source
                          </a>
                        </div>
                        <Button
                          variant="outline"
                          disabled={running || pending !== null}
                          onClick={() => void retryProduct(row.handle)}
                        >
                          {pending === row.handle
                            ? "Relance…"
                            : "Relancer cette fiche"}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <SourceStatus
                          label="JSON Shopify"
                          complete={row.jsonStatus === "complete"}
                        />
                        <SourceStatus
                          label="Page HTML"
                          complete={row.htmlStatus === "complete"}
                        />
                      </div>
                      <ul className="space-y-1 text-sm">
                        {(row.errors.length
                          ? row.errors
                          : [
                              "Une source est incomplète. Relancez la lecture de cette fiche.",
                            ]
                        ).map((message, i) => (
                          <li key={i} className="max-w-3xl break-words">
                            {message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border p-5 text-sm text-muted-foreground">
                  {page.value.cursor
                    ? "Aucune fiche en erreur dans cette tranche. Consultez la suite du catalogue."
                    : "Aucune fiche en erreur dans cette tranche. Les erreurs de tâches sont détaillées ci-dessous."}
                </p>
              )}
              {(cursors.length > 1 || page.value.cursor) && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={cursors.length === 1}
                    onClick={() => setCursors((values) => values.slice(0, -1))}
                  >
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Tranche {cursors.length}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!page.value.cursor}
                    onClick={() =>
                      setCursors((values) => [...values, page.value!.cursor!])
                    }
                  >
                    Erreurs suivantes
                  </Button>
                </div>
              )}
            </>
          )
        )}
      </section>
      <CatalogActivity op={op} />
    </div>
  )
}
