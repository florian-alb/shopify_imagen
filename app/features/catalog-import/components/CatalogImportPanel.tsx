import { useState } from "react"
import { useAction, useQuery } from "convex/react"
import { useNavigate } from "@tanstack/react-router"
import { api, type Doc, type Id } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import type { Preparation } from "../../../../convex/catalogImport/model"
import { CatalogError } from "./CatalogShared"

export function CatalogImportPanel({
  op,
  prep,
}: {
  op: Doc<"catalogOperations">
  prep: Preparation
}) {
  const shops = useQuery(api.catalogImport.destinationShops)
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(0)
  const authorize = useAction(api.shopify.beginAuthorization)
  const [shopId, setShopId] = useState("")
  const [selected, setSelected] = useState(
    prep.collections.filter((c) => c.selected && c.approved).map((c) => c.key),
  )
  const [diagnostic, setDiagnostic] = useState<{
    missing: string[]
    currency: string
    domain: string
  } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const check = useAction(api.catalogImportActions.importDiagnostic)
  const start = useAction(api.catalogImportActions.startImport)
  const navigate = useNavigate()
  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.")
    } finally {
      setBusy(false)
    }
  }
  const visible = prep.collections.filter(
    (c) =>
      c.selected && c.targetTitle.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Préparer l’import Shopify</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Les produits seront créés en brouillon et le menu sera ajouté
          séparément. Les fiches déjà importées seront retrouvées grâce à leur
          identifiant source.
        </p>
      </div>
      {!op.finalKey && (
        <CatalogError message="Générez d’abord le fichier d’export pour figer les corrections à importer." />
      )}
      <label className="block space-y-2 text-sm font-medium">
        <span>Boutique de destination</span>
        <select
          className="h-11 w-full rounded-md border bg-background px-3"
          value={shopId}
          onChange={(e) => {
            setShopId(e.target.value)
            setDiagnostic(null)
            setConfirmed(false)
          }}
        >
          <option value="">Choisir une boutique connectée</option>
          {shops
            ?.filter((s) => s._id)
            .map((shop) => (
              <option key={shop._id!} value={shop._id!}>
                {shop.name} · {shop.domain}
              </option>
            ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={busy || !shopId}
        onClick={() =>
          void run(async () =>
            setDiagnostic(await check({ shopId: shopId as Id<"shops"> })),
          )
        }
      >
        Vérifier les accès
      </Button>
      {diagnostic &&
        (diagnostic.missing.length ? (
          <CatalogError
            message={`Accès requis : ${diagnostic.missing.join(", ")}. Mettez à jour l’application Shopify et réautorisez cette boutique.`}
          />
        ) : (
          <p className="text-sm">
            Accès vérifiés · {diagnostic.domain} · devise {diagnostic.currency}
          </p>
        ))}
      {diagnostic?.missing.length ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await authorize({
                shopId: shopId as Id<"shops">,
                catalog: true,
              })
              window.location.assign(result.authorizationUrl)
            })
          }
        >
          Réautoriser les accès catalogue
        </Button>
      ) : null}
      <label className="block space-y-2 text-sm">
        <span>Filtrer les collections</span>
        <input
          className="h-11 w-full rounded-md border bg-background px-3"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(0)
          }}
        />
      </label>
      <fieldset className="space-y-3">
        <legend className="mb-3 font-semibold">Collections à importer</legend>
        {visible.slice(page * 20, (page + 1) * 20).map((c) => (
          <label
            key={c.key}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <input
              type="checkbox"
              checked={selected.includes(c.key)}
              disabled={!c.approved}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, c.key]
                    : s.filter((k) => k !== c.key),
                )
              }
              className="mt-1 size-4 accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium">{c.targetTitle}</span>
              <span className="mt-1 block text-muted-foreground">
                {c.approved
                  ? c.tags.join(c.match === "all" ? " ET " : " OU ")
                  : "Règle à valider dans Structure"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Précédent
        </Button>
        <Button
          variant="outline"
          disabled={(page + 1) * 20 >= visible.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </Button>
        <span className="self-center text-sm">
          {visible.length} collections
        </span>
      </div>
      <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-6">
        <p>
          {selected.length} collections sélectionnées. Les rubriques
          complémentaires seront ajoutées à la description. Les images seront
          copiées par Shopify depuis leurs URL source.
        </p>
        <p className="mt-2">
          Les produits incomplets et les devises incompatibles seront signalés.
          L’affectation du menu au thème et la publication resteront à effectuer
          dans Shopify.
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          J’ai vérifié la boutique de destination et les collections. Créer les
          produits en brouillon et un nouveau menu.
        </span>
      </label>
      {error && <CatalogError message={error} />}
      <Button
        disabled={
          busy ||
          !op.finalKey ||
          !confirmed ||
          !diagnostic ||
          diagnostic.missing.length > 0 ||
          !selected.length
        }
        onClick={() =>
          void run(async () => {
            const id = await start({
              id: op._id,
              shopId: shopId as Id<"shops">,
              collections: selected,
            })
            await navigate({
              to: "/catalog-import/$exportId",
              params: { exportId: id },
            })
          })
        }
      >
        {busy ? "Préparation…" : "Lancer l’import Shopify"}
      </Button>
    </section>
  )
}
