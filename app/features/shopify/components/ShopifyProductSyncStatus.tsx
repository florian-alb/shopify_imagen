import { useQuery } from "convex/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "@/lib/convex"

export function ShopifyProductSyncStatus({ className }: { className?: string }) {
  const run = useQuery(api.productSync.current)
  if (!run) return null
  const failed = run.status === "failed"
  let title = "Catalogue Shopify synchronisé"
  if (failed) title = "Synchronisation interrompue"
  else if (run.status === "running")
    title = run.phase === "syncing" ? "Synchronisation du catalogue Shopify…" : "Vérification des suppressions Shopify…"

  return (
    <Alert variant={failed ? "destructive" : "default"} role={failed ? "alert" : "status"} className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {run.synced.toLocaleString("fr-FR")} produits actualisés · {run.checked.toLocaleString("fr-FR")} vérifiés · {run.removed.toLocaleString("fr-FR")} archivés
        {failed ? <p>{run.error ?? "Relancez la synchronisation pour poursuivre la vérification."}</p>
          : <p>Les produits supprimés de Shopify sont retirés des vues actives. Leur historique est conservé.</p>}
      </AlertDescription>
    </Alert>
  )
}
