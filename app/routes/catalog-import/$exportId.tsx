import { createFileRoute, Link } from "@tanstack/react-router"
import type { Id } from "@/lib/convex"
import { CatalogWorkspace } from "@/features/catalog-import/components/CatalogWorkspace"

export const Route = createFileRoute("/catalog-import/$exportId")({
  component: Workspace,
  errorComponent: ({ reset }) => (
    <section className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Catalogue indisponible</h1>
      <p>
        Les liens de l’ancien moteur ne sont pas convertis. Retrouvez les
        nouveaux catalogues dans la liste.
      </p>
      <div className="flex gap-4 text-sm underline underline-offset-4">
        <Link to="/catalog-import">Tous les catalogues</Link>
        <button onClick={reset}>Réessayer</button>
      </div>
    </section>
  ),
})
function Workspace() {
  return (
    <CatalogWorkspace id={Route.useParams().exportId as Id<"catalogues">} />
  )
}
