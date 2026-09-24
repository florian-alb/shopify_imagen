import { useCallback, useEffect, useRef, useState } from "react"

/** Imperative Convex actions read private R2, while operation metadata remains reactive. */
export function useCatalogRemote<T>(
  load: () => Promise<T>,
  identity: string,
  enabled = true,
) {
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  }, [load])
  const [state, setState] = useState<{
    key: string
    value: T | null
    error: string | null
  }>({ key: "", value: null, error: null })
  const [revision, setRevision] = useState(0)
  const key = `${identity}:${revision}`
  useEffect(() => {
    if (!enabled) return
    let live = true
    void loader.current().then(
      (value) => {
        if (live) setState({ key, value, error: null })
      },
      (error) => {
        if (live)
          setState({
            key,
            value: null,
            error:
              error instanceof Error ? error.message : "Chargement impossible.",
          })
      },
    )
    return () => {
      live = false
    }
  }, [key, enabled])
  const reload = useCallback(() => setRevision((r) => r + 1), [])
  return {
    value: state.key === key ? state.value : null,
    error: state.key === key ? state.error : null,
    loading: enabled && state.key !== key,
    reload,
  }
}
