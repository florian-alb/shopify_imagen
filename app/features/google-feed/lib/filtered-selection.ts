import type { FeedDetails, FeedProduct, FeedProductPage, FeedRow } from "../types"

export type BulkFeedDetails = {
  product: Pick<FeedProduct, "id" | "title">
  rows: Pick<FeedRow, "id" | "attribute" | "sourceKind" | "status" | "included" | "updatedAt">[]
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new Error("Sélection annulée")
}

export async function collectFilteredFeedProducts(
  readPage: (after?: FeedProduct["id"]) => Promise<FeedProductPage>,
  onProgress: (count: number) => void,
  signal: AbortSignal,
): Promise<FeedProduct[]> {
  const products = new Map<FeedProduct["id"], FeedProduct>()
  const cursors = new Set<FeedProduct["id"]>()
  let after: FeedProduct["id"] | undefined
  while (true) {
    checkCancelled(signal)
    const page = await readPage(after)
    checkCancelled(signal)
    for (const product of page.products) products.set(product.id, product)
    onProgress(products.size)
    if (!page.hasMore) return [...products.values()]
    if (!page.after || cursors.has(page.after))
      throw new Error("Le chargement des produits est incomplet. Réessayez la sélection.")
    cursors.add(page.after)
    after = page.after
  }
}

export async function loadBulkFeedDetails(
  ids: FeedProduct["id"][],
  readDetails: (productId: FeedProduct["id"]) => Promise<FeedDetails>,
  onProgress: (count: number) => void,
  signal: AbortSignal,
): Promise<BulkFeedDetails[]> {
  const snapshots: BulkFeedDetails[] = []
  for (let start = 0; start < ids.length; start += 4) {
    checkCancelled(signal)
    const batch = await Promise.all(ids.slice(start, start + 4).map(async (id): Promise<BulkFeedDetails> => {
      const { product, rows } = await readDetails(id)
      return {
        product: { id: product.id, title: product.title },
        rows: rows.map(({ id, attribute, sourceKind, status, included, updatedAt }) => ({
          id, attribute, sourceKind, status, included, updatedAt,
        })),
      }
    }))
    checkCancelled(signal)
    snapshots.push(...batch)
    onProgress(snapshots.length)
  }
  return snapshots
}
