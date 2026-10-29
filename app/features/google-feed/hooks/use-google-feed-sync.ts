import { useAction } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/convex"
import { useShopifyProductSync } from "@/features/shopify"

export function useGoogleFeedSync() {
  const runDiagnostic = useAction(api.googleFeedActions.runDiagnostic)
  const productSync = useShopifyProductSync()
  const [busy, setBusy] = useState(false)

  async function sync() {
    setBusy(true)
    try {
      await runDiagnostic({})
      await productSync.start()
    } catch (error) {
      toast.error("Synchronisation impossible", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return { busy: busy || productSync.busy, sync }
}
