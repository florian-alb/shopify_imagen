import { useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/convex"

export function useShopifyProductSync() {
  const startSync = useMutation(api.productSync.start)
  const run = useQuery(api.productSync.current)
  const [starting, setStarting] = useState(false)

  async function start() {
    setStarting(true)
    try {
      await startSync({})
      toast.message("Synchronisation complète démarrée", {
        description: "Le traitement continue en arrière-plan. Son avancement reste visible dans l’application.",
      })
    } catch (error) {
      toast.error("Synchronisation impossible", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setStarting(false)
    }
  }

  return { start, run, busy: starting || run?.status === "running" }
}
