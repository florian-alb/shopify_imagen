import { useRef, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { api, type Doc } from "@/lib/convex"
import type { Collection, Structure } from "../../../../convex/catalogue/model"
import { collectionTagKey, collectionTagsError } from "../../../../convex/catalogue/tags"

export type TagCatalogue = Pick<Doc<"catalogues">, "_id" | "version" | "tagVersion" | "status" | "tagLanguage"> & { structure: Structure }
export type CollectionTagEdit = Partial<Pick<Collection, "tag" | "ignored">>

export function useCatalogTags(c: TagCatalogue, done: () => void) {
  const [edits, setEdits] = useState<Record<string, CollectionTagEdit>>({})
  const [saved, setSaved] = useState(false)
  const editVersion = useRef<number | null>(null)
  const save = useMutation(api.catalogues.saveTags)
  const suggest = useAction(api.catalogueActions.suggestTags)
  const draft = c.structure.collections.map((col) => ({
    ...col,
    ...edits[col.key],
    validated: edits[col.key]?.tag !== undefined ? false : col.validated,
  }))
  const counts = new Map<string, number>()
  for (const col of draft.filter((col) => !col.ignored)) {
    const key = collectionTagKey(col.tag)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const errors = new Map(draft.map((col) => [col.key, col.ignored ? null :
    collectionTagsError(col.tag) ?? ((counts.get(collectionTagKey(col.tag)) ?? 0) > 1
      ? "Cette combinaison de tags est déjà utilisée par une autre collection."
      : null),
  ]))
  function edit(values: Record<string, CollectionTagEdit>) {
    editVersion.current ??= c.tagVersion ?? 0
    setSaved(false)
    setEdits((previous) => {
      const next = { ...previous }
      for (const [key, value] of Object.entries(values)) next[key] = { ...next[key], ...value }
      return next
    })
  }
  function reset() {
    setEdits({})
    editVersion.current = null
    setSaved(false)
  }
  async function persist(validate: boolean, collect: boolean) {
    await save({
      id: c._id, version: c.version,
      tagVersion: editVersion.current ?? c.tagVersion ?? 0,
      values: draft.map(({ key, tag, ignored }) => ({ key, tag, ignored: Boolean(ignored) })),
      validate, collect,
    })
    reset()
    setSaved(true)
    if (collect) done()
  }
  async function propose() {
    const proposals = await suggest({ id: c._id, replaceExisting: true })
    const active = new Set(draft.filter((col) => !col.ignored).map((col) => col.key))
    edit(Object.fromEntries(proposals.filter((col) => active.has(col.key)).map(({ key, tag }) => [key, { tag }])))
  }
  return {
    draft, errors, saved,
    invalid: [...errors.values()].some(Boolean),
    changed: Object.keys(edits).length > 0,
    edit, reset, persist, propose,
  }
}
