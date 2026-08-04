import { useAction } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/convex"

export function useGoogleFeedSync() {
  const runDiagnostic = useAction(api.googleFeedActions.runDiagnostic)
  const syncProducts = useAction(api.shopify.syncProducts)
  const [busy, setBusy] = useState(false)

  async function sync() {
    setBusy(true)
    try {
      const diagnostic = await runDiagnostic({})
      const result = await syncProducts({ limit: 250 })
      toast.success("Flux Google synchronisé", {
        description: `${result.synced} produits actualisés · diagnostic ${diagnostic.status}.`,
      })
    } catch (error) {
      toast.error("Synchronisation impossible", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return { busy, sync }
}
