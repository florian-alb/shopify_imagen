import { shopifyCsvHeader } from "../../../../convex/catalogue/csv"

export type CsvPage = {
  products: string[]
  scanned: number
  skipped: number
  isDone: boolean
  continueCursor: string
}
export type CsvProgress = { scanned: number; exported: number; skipped: number }

// Shopify accepts files up to 15 MB. Keep every product and all its rows together.
export async function buildCsvFiles(
  readPage: (cursor: string | null) => Promise<CsvPage>,
  onProgress: (progress: CsvProgress) => void,
  signal: AbortSignal,
  maxBytes = 15_000_000,
): Promise<Blob[]> {
  const encoder = new TextEncoder()
  const header = "\uFEFF" + shopifyCsvHeader
  const headerBytes = encoder.encode(header).length
  const files: Blob[] = []
  let parts = [header], bytes = headerBytes
  let cursor: string | null = null
  const cursors = new Set<string>()
  const progress: CsvProgress = { scanned: 0, exported: 0, skipped: 0 }
  do {
    signal.throwIfAborted()
    const page = await readPage(cursor)
    signal.throwIfAborted()
    for (const product of page.products) {
      const size = encoder.encode(product).length
      if (size + headerBytes > maxBytes)
        throw new Error("Un produit dépasse à lui seul la taille maximale d’un CSV Shopify (15 Mo).")
      if (bytes + size > maxBytes) {
        files.push(new Blob(parts, { type: "text/csv;charset=utf-8" }))
        parts = [header]
        bytes = headerBytes
      }
      parts.push(product)
      bytes += size
    }
    progress.scanned += page.scanned
    progress.exported += page.products.length
    progress.skipped += page.skipped
    onProgress({ ...progress })
    if (page.isDone) break
    if (!page.continueCursor || cursors.has(page.continueCursor))
      throw new Error("L’export CSV n’a pas progressé. Relancez l’export.")
    cursor = page.continueCursor
    cursors.add(cursor)
  } while (cursor !== null)
  if (!progress.exported)
    throw new Error("Aucune fiche complète et non exclue à exporter.")
  files.push(new Blob(parts, { type: "text/csv;charset=utf-8" }))
  return files
}
