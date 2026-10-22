// In-memory fixtures only: no network, no generation, no Shopify writes.
import type { Doc, Id } from "../app/lib/convex"
import type { ProductListItem, VisualGroupsData } from "../app/features/products/types"

function textile(color: string, label: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><linearGradient id="fabric"><stop stop-color="${color}"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><rect width="500" height="500" fill="#f1eeea"/><rect x="90" y="65" width="320" height="350" rx="4" fill="${color}"/><path d="M110 65v350m40-350v350m40-350v350m40-350v350m40-350v350m40-350v350m40-350v350m40-350v350" stroke="#fff" stroke-opacity=".25" stroke-width="12"/><rect x="80" y="56" width="340" height="8" rx="4" fill="#4b4b4b"/><text x="250" y="458" text-anchor="middle" font-family="Arial" font-size="16" fill="#4b4b4b">${label} · illustration de test</text></svg>`)}`
}
const rows = new Map<string, Doc<"generatedImages">[]>()
export const workspaceLog: string[] = []
export const workspaceListeners = new Set<() => void>()
const colors = ["#c1ae8e", "#727d61"]
export function workspaceImages(productId: string) {
  if (!rows.has(productId)) {
    const grouped = productId === "product-1" || productId === "product-3"
    rows.set(productId, Array.from({ length: grouped ? 8 : 4 }, (_, index) => ({
      _id: `${productId}-image-${index}` as Id<"generatedImages">, _creationTime: 1,
      productId: productId as Id<"products">, jobId: "job-fixture" as Id<"generationJobs">,
      imageType: `type-${index % 3}`, promptUsed: "Texte exact du prompt conservé dans l’historique.",
      visualGroupId: grouped ? `${productId}-group-${index < 3 ? 0 : 1}` as Id<"visualGroups"> : undefined,
      visualGroupLabel: grouped ? index < 3 ? "Sable" : "Olive" : undefined,
      status: index === 6 ? "failed" : index === 7 ? "generating" : index === 3 ? "uploaded" : "generated",
      reviewStatus: index === 1 || index === 2 ? "pending" : index === 5 ? "rejected" : "approved",
      storageUrl: index < 6 ? textile(colors[index < 3 ? 0 : 1], `Vue ${index % 3 + 1}`) : undefined,
      shopifyMediaId: index === 3 ? "gid://shopify/MediaImage/1" : undefined,
      error: index === 6 ? "Génération interrompue. La référence est conservée." : undefined,
      createdAt: 1, updatedAt: 1,
    })))
  }
  return rows.get(productId)!
}
export function workspaceProduct(product: ProductListItem): Doc<"products"> {
  return { ...product, currentShopifyImages: [0, 1].map(i => ({ mediaId: `gid://shopify/MediaImage/${i + 1}`, url: textile(colors[i], ["Référence sable", "Référence olive"][i]) })),
    collections: [{ title: "Essentiels" }], lastSyncedAt: Date.now(), latestJobId: "job-fixture", descriptionHtml: "<p>Lin naturel.</p>",
  } as unknown as Doc<"products">
}
export function workspaceGroups(productId: string): VisualGroupsData | null {
  if (productId !== "product-1" && productId !== "product-3") return null
  return {
    config: { _id: "config-fixture", optionNames: ["Couleur"], analysisStatus: "completed", analysisCostUsd: 0.02 },
    options: [{ name: "Couleur", values: ["Sable", "Olive"] }], suggestedOptionNames: ["Couleur"],
    groups: ["Sable", "Olive"].map((label, i) => ({
      _id: `${productId}-group-${i}`, label, optionValues: [{ name: "Couleur", value: label }], swatchCss: colors[i], ready: true,
      variants: [{ _id: `variant-${i}`, title: label, shopifyVariantId: `gid://shopify/ProductVariant/${i}` }],
      references: [{ _id: `reference-${i}`, mediaId: `gid://shopify/MediaImage/${i + 1}`, confirmed: true, confidence: 1,
        assignmentSource: "manual", sourceUrl: textile(colors[i], `Référence ${label}`), referenceUrl: textile(colors[i], `Référence ${label}`), position: 0 }],
    })), unassignedReferences: [], family: null,
  } as unknown as VisualGroupsData
}
export function mutateWorkspace(name: string, args: Record<string, unknown>) {
  if (name !== "jobs:reviewImages" && name !== "shopify:pushProductImages") throw new Error("Cette action n’est pas simulée. Aucune requête externe envoyée.")
  const ids = args.imageIds as string[]
  for (const [id, images] of rows) rows.set(id, images.map(image => ids.includes(image._id) ? {
    ...image, ...(name === "jobs:reviewImages" ? { reviewStatus: args.reviewStatus as "approved" | "rejected" } : { status: "uploaded" as const }),
  } : image))
  workspaceLog.push(`${name} ${JSON.stringify(args)}`)
  return { updated: ids.length }
}
