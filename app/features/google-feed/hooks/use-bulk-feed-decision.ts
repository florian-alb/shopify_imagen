import { useConvex, useMutation } from "convex/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/convex"
import { applyBulkFeedDecision, bulkFeedTargets } from "../lib/bulk-decisions"
import { loadBulkFeedDetails, type BulkFeedDetails } from "../lib/filtered-selection"
import type { GoogleFeedAttribute } from "../constants"
import type { FeedProduct } from "../types"

export function useBulkFeedDecision(
  products: FeedProduct[],
  onDone: (ids: string[]) => void,
  onBusyChange: (busy: boolean) => void,
) {
  const convex = useConvex()
  const choose = useMutation(api.googleFeedWorkspace.choose)
  const [snapshot, setSnapshot] = useState<{
    key: string; details: BulkFeedDetails[] | null; error: string | null; loaded: number
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [failures, setFailures] = useState<Awaited<ReturnType<typeof applyBulkFeedDecision>>["failures"]>([])
  const productIds = useMemo(() => JSON.stringify(products.map((product) => product.id)), [products])
  const details = snapshot?.key === productIds ? snapshot.details : null
  const error = snapshot?.key === productIds ? snapshot.error : null
  useEffect(() => {
    const controller = new AbortController()
    const ids = JSON.parse(productIds) as FeedProduct["id"][]
    void loadBulkFeedDetails(ids,
      (productId) => convex.query(api.googleFeedWorkspace.productDetails, { productId, view: "review" }),
      (loaded) => {
        if (!controller.signal.aborted) setSnapshot({ key: productIds, details: null, error: null, loaded })
      }, controller.signal,
    ).then((result) => {
      if (!controller.signal.aborted) setSnapshot({ key: productIds, details: result, error: null, loaded: ids.length })
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setSnapshot({ key: productIds, details: null, error: reason instanceof Error ? reason.message : String(reason), loaded: 0 })
    })
    return () => { controller.abort() }
  }, [convex, productIds, attempt])

  function reload() {
    setSnapshot(null)
    setFailures([])
    setAttempt((current) => current + 1)
  }
  async function save(attribute: GoogleFeedAttribute, value: string) {
    if (!details || progress !== null) return
    setProgress(0)
    setFailures([])
    onBusyChange(true)
    try {
      const result = await applyBulkFeedDecision(bulkFeedTargets(details, attribute), attribute, value, choose, setProgress)
      if (result.updated) toast.success(`${result.updated} valeur${result.updated === 1 ? "" : "s"} corrigée${result.updated === 1 ? "" : "s"}`)
      else if (result.completed.length) toast.success("Corrections existantes conservées")
      if (result.failures.length) {
        toast.error(`${result.failures.length} produit${result.failures.length === 1 ? "" : "s"} à réessayer`)
        setFailures(result.failures)
      }
      onDone(result.completed)
    } finally {
      setProgress(null)
      onBusyChange(false)
    }
  }
  return { details, error, reload, progress, failures, save, loaded: snapshot?.key === productIds ? snapshot.loaded : 0 }
}
