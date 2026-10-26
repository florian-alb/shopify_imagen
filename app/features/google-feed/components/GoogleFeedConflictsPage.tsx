import { Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ArrowLeft, Eye } from "lucide-react"
import { useDeferredValue, useState } from "react"
import { EmptyState, PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { api, type Id } from "@/lib/convex"
import { GoogleFeedConflictDetail } from "./GoogleFeedConflictDetail"
import { GoogleFeedConflictList } from "./GoogleFeedConflictList"

export function GoogleFeedConflictsPage() {
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [cursors, setCursors] = useState<Array<Id<"products"> | undefined>>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [chosenId, setChosenId] = useState<Id<"products"> | "waiting" | null>(null)
  const list = useQuery(api.googleFeedConflicts.listProducts, {
    after: cursors[pageIndex],
    search: deferredSearch,
  })
  const selectedId =
    chosenId === "waiting"
      ? undefined
      : (list?.products.find((product) => product.id === chosenId)?.id ?? list?.products[0]?.id)
  const details = useQuery(
    api.googleFeedConflicts.productDetails,
    selectedId ? { productId: selectedId } : "skip",
  )

  function nextProduct() {
    const index = list?.products.findIndex((product) => product.id === selectedId) ?? -1
    const next = list?.products[index + 1]
    if (next) setChosenId(next.id)
    else if (list?.hasMore && list.after) nextPage()
    else setChosenId(list?.products.find((product) => product.id !== selectedId)?.id ?? "waiting")
  }
  function nextPage() {
    if (!list?.hasMore || !list.after) return
    setCursors((current) => [...current.slice(0, pageIndex + 1), list.after ?? undefined])
    setPageIndex((current) => current + 1)
    setChosenId(null)
  }

  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Résoudre les conflits"
        eyebrow="Flux Google"
        action={
          <>
            <Button variant="outline" asChild>
              <Link to="/google-feed" search={{ view: "all", page: 1, size: 20 }}>
                <ArrowLeft data-icon="inline-start" />
                Catalogue
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/google-feed/preview" search={{ status: "ready", page: 1 }}>
                <Eye data-icon="inline-start" />
                Voir les modifications prêtes
              </Link>
            </Button>
          </>
        }
      >
        Une décision par produit. Comparez les règles, puis choisissez les valeurs à préparer pour
        ses variantes.
      </PageHeader>
      <div className="grid min-w-0 overflow-hidden rounded-lg border bg-card lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,2fr)]">
        <GoogleFeedConflictList
          products={list?.products ?? []}
          selectedId={selectedId}
          search={search}
          pending={list === undefined || search !== deferredSearch}
          page={pageIndex + 1}
          hasMore={list?.hasMore ?? false}
          onSearch={(value) => {
            setSearch(value)
            setPageIndex(0)
            setCursors([undefined])
            setChosenId(null)
          }}
          onSelect={(product) => {
            setChosenId(product.id)
            if (window.matchMedia("(max-width: 1023px)").matches) {
              document.getElementById("conflict-product-detail")?.scrollIntoView({ block: "start" })
            }
          }}
          onPrevious={() => {
            setPageIndex((current) => Math.max(0, current - 1))
            setChosenId(null)
          }}
          onNext={nextPage}
        />
        <section id="conflict-product-detail" className="min-w-0" aria-label="Produit sélectionné">
          {selectedId ? (
            details ? (
              <GoogleFeedConflictDetail key={selectedId} details={details} onSkip={nextProduct} />
            ) : (
              <EmptyState
                loading
                title="Lecture des règles"
                body="Comparaison des propositions et de leurs déclencheurs."
              />
            )
          ) : list === undefined ? (
            <EmptyState
              loading
              title="Chargement des produits"
              body="Lecture des conflits de la boutique active."
            />
          ) : (
            <EmptyState
              title={
                chosenId === "waiting"
                  ? "Produit laissé en attente"
                  : search
                    ? "Aucun produit trouvé"
                    : pageIndex > 0
                      ? "Aucun autre produit sur cette page"
                      : "Aucun conflit à résoudre"
              }
              body={
                chosenId === "waiting"
                  ? "Ce produit reste dans la liste. Sélectionnez-le pour reprendre sa résolution."
                  : list.hasMore
                    ? "Poursuivez la recherche avec la page suivante."
                    : "Les choix validés restent dans les modifications prêtes. Vous pouvez revenir aux pages précédentes. Aucune donnée Shopify n’est publiée automatiquement."
              }
            />
          )}
        </section>
      </div>
    </main>
  )
}
