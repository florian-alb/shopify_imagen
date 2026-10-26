import type { Collection } from "../../../../convex/catalogue/model"
import { normalizeCollectionTags } from "../../../../convex/catalogue/tags"

export type CollectionTagEdit = Partial<Pick<Collection, "tag" | "ignored">>
export type CollectionTagEdits = Record<string, CollectionTagEdit>

export function captureTagEditBases(
  collections: Collection[],
  bases: CollectionTagEdits,
  updates: CollectionTagEdits,
): CollectionTagEdits {
  const next = { ...bases }
  const byKey = new Map(collections.map((col) => [col.key, col]))
  for (const [key, update] of Object.entries(updates)) {
    const col = byKey.get(key)
    if (!col) throw new Error("Collection inconnue.")
    const base = { ...next[key] }
    if (update.tag !== undefined && base.tag === undefined) base.tag = col.tag
    if (update.ignored !== undefined && base.ignored === undefined) base.ignored = Boolean(col.ignored)
    next[key] = base
  }
  return next
}

export function tagValuesForSave(
  collections: Collection[],
  edits: CollectionTagEdits,
  bases: CollectionTagEdits,
): Array<{ key: string; tag: string; ignored: boolean }> {
  const byKey = new Map(collections.map((col) => [col.key, col]))
  for (const [key, edit] of Object.entries(edits)) {
    const col = byKey.get(key)
    const base = bases[key]
    if (!col || !base) throw new Error("Les collections ont changé. Rechargez les tags.")
    // An unsaved manual edit takes precedence over an automatic proposal.
    // Changes saved or validated by another user must remain protected.
    if (edit.tag !== undefined && (col.edited || col.validated) && (
      base.tag === undefined || (
        normalizeCollectionTags(col.tag) !== normalizeCollectionTags(base.tag) &&
        normalizeCollectionTags(col.tag) !== normalizeCollectionTags(edit.tag)
      )
    ))
      throw new Error(`Les tags de « ${col.title} » ont été modifiés ailleurs.`)
    if (edit.ignored !== undefined && (
      base.ignored === undefined || (
        Boolean(col.ignored) !== base.ignored && Boolean(col.ignored) !== edit.ignored
      )
    ))
      throw new Error(`L’exclusion de « ${col.title} » a été modifiée ailleurs.`)
  }
  return collections.map((col) => ({
    key: col.key,
    tag: edits[col.key]?.tag ?? col.tag,
    ignored: edits[col.key]?.ignored ?? Boolean(col.ignored),
  }))
}
