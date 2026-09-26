// Development-only browser check using real React effects and a fake Convex client.
// Start: npx vite --config scripts/vite.catalog-query.config.ts
// Open http://127.0.0.1:3001/scripts/catalog_query_check.html. No backend calls.
import { act } from "react"
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"
import {
  resetCatalogSession,
  useCatalogQuery,
} from "../app/features/catalog-import/hooks/use-catalog-query"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let subscriptions = 0,
  active = 0,
  value = "initial"
const listeners = new Set<() => void>()
const client = {
  watchQuery() {
    if (subscriptions > 20) throw new Error("Boucle de réabonnement détectée")
    return {
      localQueryResult: () => value,
      onUpdate(callback: () => void) {
        subscriptions++
        active++
        listeners.add(callback)
        return () => {
          active--
          listeners.delete(callback)
        }
      },
    }
  },
} as unknown as ConvexReactClient
function Fixture({ id }: { id: string }) {
  // Each access returns a new api proxy, just like the actual catalogue components.
  const result = useCatalogQuery(
    api.catalogWorkspace.structure,
    { id: id as Id<"catalogOperations"> },
    "owner",
  )
  return <p>{result.value}</p>
}
const root = createRoot(document.getElementById("fixture")!)
const checks: string[] = []
function check(condition: boolean, message: string) {
  if (!condition)
    throw new Error(
      `${message} (subscriptions=${subscriptions}, active=${active})`,
    )
  checks.push(`PASS — ${message}`)
}
async function render(id: string) {
  await act(async () => {
    root.render(
      <ConvexProvider client={client}>
        <Fixture id={id} />
      </ConvexProvider>,
    )
  })
}
try {
  resetCatalogSession("owner")
  await render("fixture-a")
  check(subscriptions === 1 && active === 1, "Un abonnement au montage")
  for (let i = 0; i < 10; i++) await render("fixture-a")
  check(
    subscriptions === 1 && active === 1,
    "Dix rendus avec de nouveaux proxies : aucun réabonnement",
  )
  await act(async () => {
    value = "updated"
    for (const callback of listeners) callback()
  })
  check(
    subscriptions === 1 &&
      document.getElementById("fixture")!.textContent === "updated",
    "Mise à jour réactive sans boucle",
  )
  await render("fixture-b")
  check(
    subscriptions === 2 && active === 1,
    "Changement de catalogue : remplacement unique de l’abonnement",
  )
  await act(async () => root.unmount())
  check(active === 0, "Aucun abonnement après démontage")
  document.getElementById("result")!.textContent = checks.join("\n")
} catch (error) {
  document.getElementById("result")!.textContent =
    `FAIL — ${error instanceof Error ? error.message : String(error)}`
}
