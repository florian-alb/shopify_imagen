import { useCallback, useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server"

// No persisted private data, no retained subscriptions. The mounted page owns its
// watch; identical watches are deduplicated by the Convex client.
const cache = new Map<string, { value: unknown; bytes: number }>()
const navigation = new Map<string, unknown>()
let bytes = 0
let session: string | null = null
export function resetCatalogSession(identity: string | null) {
  if (identity === session) return
  session = identity
  cache.clear()
  navigation.clear()
  bytes = 0
}
function remember(key: string, value: unknown) {
  const size = JSON.stringify(value).length * 2
  bytes -= cache.get(key)?.bytes ?? 0
  cache.delete(key)
  if (size > 2_000_000) return
  cache.set(key, { value, bytes: size })
  bytes += size
  while (cache.size > 32 || bytes > 8_000_000) {
    const oldest = cache.keys().next().value!
    bytes -= cache.get(oldest)!.bytes
    cache.delete(oldest)
  }
}
export function useCatalogNavigation<T>(key: string, initial: T) {
  const [initialValue] = useState(initial)
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: (navigation.get(key) as T | undefined) ?? initialValue,
  }))
  const value =
    state.key === key
      ? state.value
      : ((navigation.get(key) as T | undefined) ?? initialValue)
  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      setState((previous) => {
        const current =
          previous.key === key
            ? previous.value
            : ((navigation.get(key) as T | undefined) ?? initialValue)
        return {
          key,
          value:
            typeof next === "function"
              ? (next as (previous: T) => T)(current)
              : next,
        }
      })
    },
    [key, initialValue],
  )
  useEffect(() => {
    navigation.delete(key)
    navigation.set(key, value)
    while (navigation.size > 20)
      navigation.delete(navigation.keys().next().value!)
  }, [key, value])
  return [value, setValue] as const
}
export function useCatalogQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: FunctionArgs<Q> | "skip",
  identity: string,
) {
  const convex = useConvex()
  const serialized = JSON.stringify(args)
  const stableArgs = useMemo(
    () => JSON.parse(serialized) as FunctionArgs<Q> | "skip",
    [serialized],
  )
  const name = getFunctionName(query)
  const key = `${identity}:${name}:${serialized}`
  const [state, setState] = useState<{
    key: string
    value?: FunctionReturnType<Q>
    error?: string
  }>({ key: "" })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (stableArgs === "skip") return
    let live = true
    const ownerSession = session
    // Generated api references are proxies with a new identity on each access.
    // Subscribe by the stable function name, never by the proxy's identity.
    const reference = makeFunctionReference<
      "query",
      FunctionArgs<Q>,
      FunctionReturnType<Q>
    >(name)
    const watch = convex.watchQuery(reference, stableArgs)
    const update = () => {
      try {
        const value = watch.localQueryResult()
        if (value !== undefined && live && ownerSession === session) {
          remember(key, value)
          setState({ key, value })
        }
      } catch (error) {
        if (live)
          setState({
            key,
            error:
              error instanceof Error ? error.message : "Lecture impossible.",
          })
      }
    }
    const unsubscribe = watch.onUpdate(update)
    update()
    return () => {
      live = false
      unsubscribe()
    }
  }, [convex, name, stableArgs, key, retry])
  const reload = useCallback(() => setRetry((n) => n + 1), [])
  const value =
    (state.key === key ? state.value : undefined) ??
    (cache.get(key)?.value as FunctionReturnType<Q> | undefined)
  const error = state.key === key ? (state.error ?? null) : null
  return {
    value: args === "skip" ? null : (value ?? null),
    error,
    loading: args !== "skip" && value === undefined && !error,
    refreshing: value !== undefined && state.key !== key,
    reload,
  }
}
