import { useEffect, useRef, useState } from "react"
import { useConvex } from "convex/react"
import { api, type Id } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { buildCsvFiles, type CsvProgress } from "../lib/csv-export"

type Props = {
  id: Id<"catalogues">
  origin: string
  version: number
  generation: number
  total: number
  partial: boolean
  disabled: boolean
}
type Download = { url: string; name: string }

export function CatalogCsvExport({ id, origin, version, generation, total, partial, disabled }: Props) {
  const client = useConvex()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState<CsvProgress>({ scanned: 0, exported: 0, skipped: 0 })
  const [downloads, setDownloads] = useState<Download[]>([])
  const controller = useRef<AbortController | null>(null)
  const urls = useRef<string[]>([])

  useEffect(() => () => {
    controller.current?.abort()
    urls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function reset() {
    controller.current?.abort()
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current = []
    setDownloads([])
    setBusy(false)
    setError("")
    setProgress({ scanned: 0, exported: 0, skipped: 0 })
  }
  async function generate() {
    reset()
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    try {
      const files = await buildCsvFiles(
        (cursor) => client.query(api.catalogues.exportCsvPage, {
          id, version, generation, allowPartial: partial, cursor,
        }),
        setProgress,
        abort.signal,
      )
      abort.signal.throwIfAborted()
      const hostname = new URL(origin).hostname.replace(/^www\./, "")
      const ready = files.map((blob, i) => ({
        url: URL.createObjectURL(blob),
        name: `catalogue-${hostname}${files.length > 1 ? `-${i + 1}` : ""}.csv`,
      }))
      urls.current = ready.map((file) => file.url)
      setDownloads(ready)
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Export CSV impossible.")
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" disabled={disabled || busy} onClick={() => {
        reset()
        setOpen(true)
        if (!partial) void generate()
      }}>
        {busy ? "Génération du CSV…" : "Exporter CSV Shopify"}
      </Button>
      <Dialog open={open} onOpenChange={(value) => {
        setOpen(value)
        if (!value) reset()
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Exporter le CSV Shopify</DialogTitle>
            <DialogDescription>
              Modèle Shopify · variantes, images et tags · produits en brouillon
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Seules les fiches complètes et non exclues sont exportées. Les champs
            indisponibles restent vides et le stock n’est pas suivi.
            Les collections et le menu ne sont pas inclus dans ce format.
          </p>
          {partial && !busy && !downloads.length && (
            <p className="text-sm">Ce catalogue est incomplet. Le CSV contiendra uniquement les fiches importables disponibles.</p>
          )}
          {busy && <p role="status" className="text-sm">{progress.scanned} / {total} fiches examinées… Vous pouvez annuler en fermant cette fenêtre.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {downloads.length > 0 ? (
            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
              <p role="status" className="text-sm">
                {progress.exported} {progress.exported === 1 ? "produit exporté" : "produits exportés"} · {progress.skipped} {progress.skipped === 1 ? "fiche ignorée" : "fiches ignorées"}.
                {downloads.length > 1 ? ` ${downloads.length} fichiers de 15 Mo maximum, à importer séparément.` : ""}
              </p>
              {downloads.map((file, i) => (
                <Button key={file.url} variant="outline" asChild>
                  <a href={file.url} download={file.name}>
                    Télécharger le CSV{downloads.length > 1 ? ` ${i + 1} / ${downloads.length}` : ""}
                  </a>
                </Button>
              ))}
            </div>
          ) : !busy && (
            <Button disabled={disabled} onClick={() => void generate()}>
              {error ? "Réessayer" : "J’accepte le caractère partiel — Générer le CSV"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
