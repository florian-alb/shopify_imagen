import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { validCollectionTag } from "../../../../convex/catalogue/tags"
import { useCollectionTagInput } from "../hooks/use-collection-tag-input"

type CollectionTagInputProps = {
  title: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  invalid: boolean
  describedBy?: string
}

export function CollectionTagInput({ title, value, onChange, disabled, invalid, describedBy }: CollectionTagInputProps) {
  const { input: inputRef, addButton: addButtonRef, tokens, draft, add, edit, remove, change, commit, keyDown, paste, compositionStart, compositionEnd } = useCollectionTagInput(value, onChange)
  const items = tokens.map((tag, index) => ({ tag, index }))
  if (draft && draft.index >= tokens.length) items.push({ tag: "", index: draft.index })
  return (
    <Field orientation="horizontal" className="w-max" aria-label={`Tags de ${title}`} data-invalid={invalid} data-disabled={disabled}>
      <div className="flex min-h-7 flex-nowrap items-center gap-2">
        {items.map(({ tag, index }) => (
          <Badge key={index} variant="secondary" className="h-7" aria-invalid={draft?.index === index ? invalid : !validCollectionTag(tag)}>
            {draft?.index === index ? (
              <input ref={inputRef} type="text" className="h-6 min-w-16 border-0 bg-transparent p-0 text-base outline-none md:text-xs"
                size={Math.max(8, Math.min(32, draft.text.length + 1))}
                aria-label={draft.adding ? `Ajouter un tag à ${title}` : `Modifier le tag de ${title}`}
                aria-invalid={invalid} aria-describedby={describedBy} value={draft.text} placeholder="Tag…" disabled={disabled}
                onChange={(e) => change(e.target.value)} onKeyDown={keyDown} onPaste={paste} onBlur={() => commit()}
                onCompositionStart={compositionStart} onCompositionEnd={(e) => compositionEnd(e.currentTarget.value)} />
            ) : <>
              <button type="button" className="whitespace-nowrap outline-none focus-visible:underline"
                aria-label={`Modifier le tag ${tag || "vide"} de ${title}`} disabled={disabled}
                onPointerDown={(e) => e.preventDefault()} onClick={() => edit(index)}>
                {tag || "Tag vide"}
              </button>
              <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                aria-label={`Supprimer le tag ${tag || "vide"} de ${title}`} disabled={disabled}
                onPointerDown={(e) => e.preventDefault()} onClick={() => remove(index)}>
                <span aria-hidden="true">×</span>
              </button>
            </>}
          </Badge>
        ))}
        <Button ref={addButtonRef} type="button" variant="ghost" size="icon-xs" aria-label={`Ajouter un tag à ${title}`}
          disabled={disabled} onClick={add}><span aria-hidden="true">+</span></Button>
      </div>
    </Field>
  )
}
