import { Button } from "@/components/ui/button"
import { TagLanguageSelect } from "./TagLanguageSelect"
import { CatalogCollectionTagsTable } from "./CatalogCollectionTagsTable"
import { useCatalogTags, type TagCatalogue } from "../hooks/use-catalog-tags"
import { tagLanguages, type TagLanguage } from "../../../../convex/catalogue/tags"

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
  const language = tagLanguages.find((x) => x.value === (c.tagLanguage ?? "en"))!.label
  return (
    <section className="px-4 py-6 md:px-6">
      <h2 className="text-lg font-semibold">Tags des collections</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Cliquez sur + pour ajouter un tag, sur un tag pour l’éditer directement, ou sur × pour le retirer.
        Quitter le champ valide la saisie ; Entrée et virgule fonctionnent aussi.
        Vous pouvez aussi coller une liste de tags séparés par des virgules.
        Un tag peut être partagé entre collections ; chaque combinaison doit être distincte.
        Dans Shopify, un produit devra posséder tous les tags de la collection.
        Après validation, les changements se
        répercutent sur les produits déjà découverts et les prochaines fiches.
        Les tags manuels propres aux produits sont conservés.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <TagLanguageSelect value={c.tagLanguage ?? "en"} onChange={(value) => void changeLanguage(value)} disabled={busy} />
        <Button
          variant="outline"
          disabled={busy || !draft.some((col) => !col.ignored)}
          onClick={() =>
            void run(propose)
          }
        >
          Reproposer tous les tags par IA
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Les propositions IA seront en {language.toLowerCase()}. Changer la langue conserve vos tags ;
        reproposer remplace les valeurs affichées, à vérifier avant d’enregistrer.
        Jusqu’à 60 tags par collection, 100 caractères par tag. Minuscules, accents, chiffres, espaces et tirets acceptés.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Ignorez les collections inutiles : aucun tag ni association à l’import Shopify, produits conservés.
        Enregistrez pour appliquer les exclusions. Réactiver une collection restaure ses tags précédents.
      </p>
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
