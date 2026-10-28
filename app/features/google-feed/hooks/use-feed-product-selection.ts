import { useConvex } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/convex"
import { collectFilteredFeedProducts } from "../lib/filtered-selection"
import type { FeedProduct } from "../types"

function emptySelection(scope: string) {
  return {
    scope, products: [] as FeedProduct[], open: false, busy: false,
    allFiltered: false, selecting: false, found: 0, error: null as string | null,
  }
}

export type FeedProductSelection = ReturnType<typeof useFeedProductSelection>

export function useFeedProductSelection(scope: string, search: string) {
  const convex = useConvex()
  const request = useRef<AbortController | null>(null)
  const [state, setState] = useState(() => emptySelection(scope))
  if (state.scope !== scope) setState(emptySelection(scope))
  useEffect(() => () => { request.current?.abort() }, [scope])
  const products = state.scope === scope ? state.products : []
  function select(items: FeedProduct[], checked: boolean) {
    setState((current) => {
      if (current.scope !== scope || current.busy || current.selecting) return current
      const selected = new Map(current.products.map((item) => [item.id, item]))
      for (const item of items) {
        if (checked) selected.set(item.id, item)
        else selected.delete(item.id)
      }
      return { ...current, products: [...selected.values()], allFiltered: false, error: null }
    })
  }
  function remove(ids: string[]) {
    const completed = new Set(ids)
    setState((current) => current.scope === scope
      ? { ...current, products: current.products.filter((product) => !completed.has(product.id)), allFiltered: false }
      : current)
  }
  function open(value: boolean) {
    setState((current) => current.scope === scope ? { ...current, open: value } : current)
  }
  function setBusy(busy: boolean) {
    setState((current) => current.scope === scope ? { ...current, busy } : current)
  }
  async function selectFiltered() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState((current) => current.scope === scope ? { ...current, selecting: true, found: 0, error: null, open: false } : current)
    try {
      const matches = await collectFilteredFeedProducts(
        (after) => convex.query(api.googleFeedWorkspace.listProducts, { view: "review", search, after }),
        (found) => setState((current) => current.scope === scope && !controller.signal.aborted ? { ...current, found } : current),
        controller.signal,
      )
      if (!controller.signal.aborted)
        setState((current) => current.scope === scope && !controller.signal.aborted
          ? { ...current, products: matches, allFiltered: true, selecting: false }
          : current)
    } catch (error) {
      if (!controller.signal.aborted)
        setState((current) => current.scope === scope && !controller.signal.aborted
          ? { ...current, selecting: false, error: error instanceof Error ? error.message : String(error) }
          : current)
    } finally {
      if (request.current === controller) request.current = null
    }
  }
  function cancelSelection() {
    request.current?.abort()
    setState((current) => current.scope === scope ? { ...current, selecting: false } : current)
  }
  function clear() {
    request.current?.abort()
    setState((current) => current.scope === scope ? emptySelection(scope) : current)
  }
  return {
    products, select, remove, open, clear, isOpen: products.length > 0 && state.open,
    busy: state.busy || state.selecting, setBusy,
    allFiltered: state.allFiltered, selecting: state.selecting, found: state.found, error: state.error,
    selectFiltered, cancelSelection,
  }
}
