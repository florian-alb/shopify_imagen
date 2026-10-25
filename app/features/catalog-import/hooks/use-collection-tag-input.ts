import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { collectionTagTokens, commitCollectionTag, writeCollectionTag } from "../lib/collection-tag-input"

type Draft = { index: number; text: string; original: string; adding: boolean }
const hasSeparator = (text: string) => /[,\r\n]/u.test(text)

export function useCollectionTagInput(value: string, onChange: (value: string) => void) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const focusAdd = useRef(false)
  const composing = useRef(false)
  const tokens = collectionTagTokens(value)
  const editingIndex = draft?.index ?? null
  useEffect(() => {
    if (editingIndex !== null) {
      input.current?.focus()
      input.current?.select()
    } else if (focusAdd.current) {
      focusAdd.current = false
      addButton.current?.focus()
    }
  }, [editingIndex])

  function commit(text = draft?.text ?? "", restoreFocus = false) {
    if (!draft && !text.trim()) return
    const next = commitCollectionTag(value, draft?.index ?? tokens.length, text)
    if (next !== value) onChange(next)
    focusAdd.current = restoreFocus
    setDraft(null)
  }
  function add() {
    setDraft({ index: tokens.length, text: "", original: value, adding: true })
  }
  function change(text: string) {
    if (hasSeparator(text) && !composing.current) { commit(text, true); return }
    const next = draft ?? { index: tokens.length, text: "", original: value, adding: true }
    setDraft({ ...next, text })
    const updated = writeCollectionTag(value, next.index, text)
    if (updated !== value) onChange(updated)
  }
  function edit(index: number) {
    setDraft({ index, text: tokens[index], original: value, adding: false })
  }
  function remove(index: number) {
    onChange(commitCollectionTag(value, index, ""))
    focusAdd.current = true
    setDraft(null)
    if (!draft) addButton.current?.focus()
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || composing.current) return
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      commit(draft?.text ?? "", true)
    } else if (event.key === "Escape" && draft) {
      event.preventDefault()
      if (value !== draft.original) onChange(draft.original)
      focusAdd.current = true
      setDraft(null)
    }
  }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text")
    if (!hasSeparator(text)) return
    event.preventDefault()
    const field = event.currentTarget
    commit(field.value.slice(0, field.selectionStart ?? field.value.length) + text +
      field.value.slice(field.selectionEnd ?? field.value.length), true)
  }
  return {
    input, addButton, tokens, draft, add, edit, remove, change, commit, keyDown, paste,
    compositionStart: () => { composing.current = true },
    compositionEnd: (text: string) => { composing.current = false; if (hasSeparator(text)) commit(text, true) },
  }
}
