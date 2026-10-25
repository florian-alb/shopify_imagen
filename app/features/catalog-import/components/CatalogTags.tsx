import { useRef, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { api, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TagLanguageSelect } from "./TagLanguageSelect"
import type { Structure } from "../../../../convex/catalogue/model"
import { collectionTagKey, collectionTagsError, tagLanguages, type TagLanguage } from "../../../../convex/catalogue/tags"

export function CatalogTags({
  c,
  run,
  busy,
  done,
  changeLanguage,
}: {
  c: Pick<Doc<"catalogues">, "_id" | "version" | "tagVersion" | "status" | "tagLanguage"> & { structure: Structure }
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
  done: () => void
  changeLanguage: (language: TagLanguage) => Promise<void>
}) {
  const [edits, setEdits] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(""),
    [saved, setSaved] = useState(false)
  const editVersion = useRef<number | null>(null)
  const save = useMutation(api.catalogues.saveTags),
    suggest = useAction(api.catalogueActions.suggestTags)
  const draft = c.structure.collections.map((col) =>
    Object.prototype.hasOwnProperty.call(edits, col.key)
      ? { ...col, tag: edits[col.key], validated: false }
      : col,
  )
  const counts = new Map<string, number>()
  for (const col of draft) {
    const key = collectionTagKey(col.tag)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const tagError = (tag: string) => collectionTagsError(tag) ??
    ((counts.get(collectionTagKey(tag)) ?? 0) > 1
      ? "Cette combinaison de tags est déjà utilisée par une autre collection."
      : null)
  const invalid = draft.some((col) => tagError(col.tag)),
    working = c.status === "working",
    needsCollection = c.status === "tags",
    language = tagLanguages.find((x) => x.value === (c.tagLanguage ?? "en"))!.label
  function edit(values: Record<string, string>) {
    editVersion.current ??= c.tagVersion ?? 0
    setSaved(false)
    setEdits((previous) => ({ ...previous, ...values }))
  }
  async function persist(validate: boolean, collect: boolean) {
    await save({
      id: c._id,
      version: c.version,
      tagVersion: editVersion.current ?? c.tagVersion ?? 0,
      values: draft.map(({ key, tag }) => ({ key, tag })),
      validate,
      collect,
    })
    setEdits({})
    editVersion.current = null
    setSaved(true)
    if (collect) done()
  }
  return (
    <section className="px-4 py-6 md:px-6">
      <h2 className="text-lg font-semibold">Tags des collections</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Un ou plusieurs tags par collection, séparés par des virgules (ex. : mocassins, femme).
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
          disabled={busy || !draft.length}
          onClick={() =>
            void run(async () => {
              const proposals = await suggest({ id: c._id, replaceExisting: true })
              edit(Object.fromEntries(proposals.map(({ key, tag }) => [key, tag])))
            })
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
      <Input
        className="my-5 max-w-sm"
        aria-label="Rechercher une collection"
        placeholder="Rechercher une collection"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!draft.length ? (
        <p className="py-6 text-sm text-muted-foreground">
          Les collections apparaîtront ici pendant la découverte. Vous pouvez déjà choisir la langue des tags.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="p-3">Collection</th>
                <th className="min-w-64 p-3">Tags</th>
                <th className="p-3">Sélection / Source</th>
                <th className="p-3">Menu</th>
              </tr>
            </thead>
            <tbody>
              {draft
                .filter((x) => x.title.toLowerCase().includes(search.toLowerCase()))
                .map((col) => (
                  <tr key={col.key} className="border-b">
                    <td className="p-3">{col.title}</td>
                    <td className="p-3">
                      <Input
                        aria-label={`Tags de ${col.title}`}
                        aria-invalid={Boolean(tagError(col.tag))}
                        aria-describedby={`tag-status-${col.key}`}
                        value={col.tag}
                        placeholder="mocassins, femme"
                        disabled={busy}
                        onChange={(e) => edit({ [col.key]: e.target.value })}
                      />
                      <span id={`tag-status-${col.key}`} className="mt-1 block text-xs">
                        {tagError(col.tag)
                          ? tagError(col.tag)
                          : col.validated ? "Validé" : "À valider"}
                      </span>
                    </td>
                    <td className="p-3">
                      {col.selectedCount} / {col.membership === "complete" ? col.count : "Non vérifié"}
                    </td>
                    <td className="p-3">{col.outsideMenu ? "Hors menu" : "Présente"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
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
        {Object.keys(edits).length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => {
            setEdits({})
            editVersion.current = null
            setSaved(false)
          }}>Annuler les modifications</Button>
        )}
      </div>
      {saved && <p role="status" className="mt-3 text-sm">Tags enregistrés.</p>}
      {invalid && draft.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Corrigez les erreurs indiquées avant d’appliquer les tags.
        </p>
      )}
    </section>
  )
}
