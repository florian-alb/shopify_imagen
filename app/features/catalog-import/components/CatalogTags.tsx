import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TagLanguageSelect } from "./TagLanguageSelect"
import { CatalogCollectionTagsTable } from "./CatalogCollectionTagsTable"
import { useCatalogTags, type TagCatalogue } from "../hooks/use-catalog-tags"
import type { TagLanguage } from "../../../../convex/catalogue/tags"

export function CatalogTags({
  c,
  run,
  busy,
  done,
  changeLanguage,
}: {
  c: TagCatalogue
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
  done: () => void
  changeLanguage: (language: TagLanguage) => Promise<void>
}) {
  const { draft, errors, saved, invalid, changed, edit, reset, persist, propose } = useCatalogTags(c, done)
  const working = c.status === "working", needsCollection = c.status === "tags"
  return (
    <section className="px-4 py-4 md:px-6 xl:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {!needsCollection && <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={done}>
            <ArrowLeft /> Collections
          </Button>}
          <h2 className="text-lg font-semibold">Tags des collections</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TagLanguageSelect value={c.tagLanguage ?? "en"} onChange={(value) => void changeLanguage(value)} disabled={busy} />
          <Button
            variant="outline"
            disabled={busy || !draft.some((col) => !col.ignored)}
            title="Remplacer les tags des collections actives dans le brouillon"
            onClick={() => void run(propose)}
          >
            Reproposer les tags
          </Button>
        </div>
      </div>
      <CatalogCollectionTagsTable collections={draft} errors={errors} busy={busy} edit={edit} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy || !draft.length} onClick={() => void run(() => persist(false, false))}>
          Enregistrer le brouillon
        </Button>
        <Button variant={needsCollection ? "outline" : "default"} disabled={busy || invalid || !draft.length} onClick={() => void run(() => persist(true, false))}>
          Enregistrer et appliquer aux produits
        </Button>
        {needsCollection && !working && (
          <Button disabled={busy || invalid || !draft.length} onClick={() => void run(() => persist(true, true))}>
            Valider les tags et collecter
          </Button>
        )}
        {changed && <Button variant="ghost" disabled={busy} onClick={reset}>Annuler les modifications</Button>}
      </div>
      {changed && <p role="status" className="mt-3 text-sm">Modifications non enregistrées.</p>}
      {saved && <p role="status" className="mt-3 text-sm">Tags et exclusions enregistrés.</p>}
      {invalid && draft.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Corrigez les erreurs indiquées avant d’appliquer les tags.
        </p>
      )}
    </section>
  )
}
