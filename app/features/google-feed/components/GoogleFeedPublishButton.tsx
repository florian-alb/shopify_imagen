import { useAction, useQuery } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { api } from "@/lib/convex"

export function GoogleFeedPublishButton({ onDone }: { onDone: (failed: boolean) => void }) {
  const count = useQuery(api.googleFeedWorkspace.countProducts, { view: "ready" })
  const activity = useQuery(api.googleFeedWorkspace.activity)
  const publish = useAction(api.googleFeedActions.publish)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      const result = await publish({})
      toast.success(`${result.published} valeurs publiées`, {
        description: result.failed ? `${result.failed} échecs` : undefined,
      })
      onDone(result.failed > 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={busy || count === undefined || !count.count || Boolean(activity)}>
          {busy ? "Publication…" : "Publier les prêts"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publier les produits prêts ?</AlertDialogTitle>
          <AlertDialogDescription>
            Toute la boutique, y compris hors de cette recherche. Les conflits et erreurs sont
            exclus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={() => void submit()}>Publier</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
