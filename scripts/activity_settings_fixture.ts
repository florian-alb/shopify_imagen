// Local UI verification only. No real credentials, services or external mutations.
import type { Doc, Id } from "../app/lib/convex"
import type { ListedJob } from "../app/features/jobs/types"
import type { ShopRow } from "../app/features/settings/types"
import type { ListedBulkOperation } from "../app/features/bulk-operations/types"
import { workspaceImages, workspaceLog } from "./product_workspace_fixture"

const time = Date.parse("2026-10-22T09:00:00Z")
let shops: ShopRow[] = [
  { _id: "shop-fixture" as Id<"shops">, name: "Maison Atelier", domain: "maison-atelier.myshopify.com", storeHandle: "maison-atelier", isActive: true, source: "database", hasClientCredentials: true, productQuery: "status:active" },
  { _id: "shop-second" as Id<"shops">, name: "Atelier Belgique", domain: "atelier-belgique.myshopify.com", storeHandle: "atelier-belgique", isActive: false, source: "database", hasClientCredentials: true, productQuery: "status:active" },
]
const settings: Record<string, unknown> = { IMAGE_PROVIDER: "openai", GENERATION_EXECUTION_MODE: "realtime", OPENAI_IMAGE_MODEL: "gpt-image-1.5", OPENAI_IMAGE_SIZE: "1024x1024", GENERATION_CONCURRENCY: "4" }
const jobs: ListedJob[] = Array.from({ length: 25 }, (_, i) => ({
  _id: (i === 0 ? "job-fixture" : `job-fixture-${i}`) as Id<"generationJobs">, _creationTime: time - i * 3600000,
  status: i === 1 ? "failed" : i === 2 ? "running" : "completed", mode: "bulk", executionMode: i % 2 ? "batch" : "realtime",
  imageProvider: i % 3 ? "gemini" : "openai", productIds: ["product-1", "product-3"] as Id<"products">[], selectedImageTypes: ["type-0", "type-1", "type-2"], forceRegenerate: false,
  totalTasks: 16, completedTasks: i === 2 ? 6 : i === 1 ? 10 : 16, failedTasks: i === 1 ? 6 : 0,
  reviewSummary: { total: 16, pending: i === 0 ? 4 : 0, approved: 10, rejected: 2 },
  costSummary: { generationCost: 1.56, inputTokens: 8000, outputTokens: 9000, pricedImageCount: 16 },
  createdAt: time - i * 3600000, updatedAt: time, archivedAt: i === 24 ? time : undefined,
}))
const mirror: Doc<"bulkTransformJobs"> = {
  _id: "mirror-fixture" as Id<"bulkTransformJobs">, _creationTime: time, createdByUserId: "user-fixture" as Id<"users">,
  operation: "flip_horizontal", status: "ready", productIds: ["product-1", "product-3"] as Id<"products">[], selectedImagePositions: [1, 2],
  seededProductCount: 2, seedAttempts: 1, seedFailedProducts: 0, seededItems: 4, totalItems: 4, transformedItems: 4, transformFailedItems: 0,
  publishedItems: 0, publishFailedItems: 0, conflictItems: 0, skippedItems: 0, unsupportedItems: 0, createdAt: time, updatedAt: time,
}
const reorder: Doc<"bulkReorderJobs"> = {
  _id: "reorder-fixture" as Id<"bulkReorderJobs">, _creationTime: time, createdByUserId: "user-fixture" as Id<"users">,
  status: "completed", firstPosition: 1, secondPosition: 2, productCount: 12, totalItems: 12, processedItems: 12, completedItems: 12,
  skippedItems: 0, failedItems: 0, conflictItems: 0, lockedItems: 0, unavailableItems: 0, createdAt: time - 3600000, updatedAt: time,
}
const mirrorRow: Extract<ListedBulkOperation, { operation: "flip_horizontal" }> = {
  key: "flip_horizontal:mirror-fixture", id: mirror._id, operation: "flip_horizontal", status: "ready", productCount: 2, processedItems: 4,
  totalItems: 4, completedItems: 0, issueItems: 0, createdAt: time, updatedAt: time, completedAt: null, dismissedAt: null, restoreStatus: null,
  restoredItems: 0, restoreIssueItems: 0, details: { kind: "mirror", selectedImagePositions: [1, 2], transformedItems: 4, publishedItems: 0, error: null },
}
const reorderRow: Extract<ListedBulkOperation, { operation: "reorder_media" }> = {
  key: "reorder_media:reorder-fixture", id: reorder._id, operation: "reorder_media", status: "completed", productCount: 12, processedItems: 12,
  totalItems: 12, completedItems: 12, issueItems: 0, createdAt: time - 3600000, updatedAt: time, completedAt: time, dismissedAt: null, restoreStatus: null,
  restoredItems: 0, restoreIssueItems: 0, details: { kind: "reorder", firstPosition: 1, secondPosition: 2, skippedItems: 0, lockedItems: 0, unavailableItems: 0, conflictItems: 0, failedItems: 0, error: null },
}
const operations: ListedBulkOperation[] = [mirrorRow, reorderRow,
  { ...reorderRow, key: "reorder_media:restore-fixture", id: "restore-fixture" as Id<"bulkReorderJobs">, restoreStatus: "partial", restoredItems: 10, restoreIssueItems: 2 },
  { ...mirrorRow, key: "flip_horizontal:failed-fixture", id: "failed-fixture" as Id<"bulkTransformJobs">, status: "failed", issueItems: 1, details: { ...mirrorRow.details, error: "Une image source n’est plus disponible. Les autres résultats sont conservés." } },
  ...Array.from({ length: 18 }, (_, i) => ({ ...reorderRow, key: `reorder_media:history-${i}`, id: `history-${i}` as Id<"bulkReorderJobs">, createdAt: time - (i + 2) * 3600000 })),
]
export function readActivity(name: string, args: Record<string, unknown>, products: Doc<"products">[]) {
  if (name === "shops:list") return shops
  if (name === "settings:shopInfo") { const active = shops.find(shop => shop.isActive)!; return { ...active, shopId: active._id } }
  if (name === "settings:list") return settings
  if (name === "settings:shopifyOnboarding") return { redirectUrl: "https://demo-fixture.convex.site/shopify/oauth/callback" }
  if (name === "jobImagePublishing:latest") return null
  if (name === "jobs:get") {
    const job = jobs.find(item => item._id === args.jobId)
    return job ? { job, images: job.productIds.flatMap(id => workspaceImages(id)), products: products.filter(p => job.productIds.includes(p._id)), segments: [] } : null
  }
  if (name === "jobs:list") {
    const filtered = jobs.filter(job => Boolean(job.archivedAt) === Boolean(args.archived) && (!args.status || args.status === job.status) &&
      (!args.review || args.review === "to-review" && job.reviewSummary!.pending > 0 || args.review === "approved" && !job.reviewSummary!.pending) &&
      (!args.provider || args.provider === job.imageProvider) && (!args.executionMode || args.executionMode === job.executionMode) &&
      (!args.productId || job.productIds.includes(args.productId as Id<"products">)))
    const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 20)
    return { page: filtered.slice(offset, offset + limit), offset, limit, hasPrevious: offset > 0, hasNext: offset + limit < filtered.length }
  }
  if (name === "jobs:costSummary") return { totalCost: 42.68, generationCost: 41, analysisCost: 1.68, inputTokens: 34000, outputTokens: 56000, pricedImageCount: 340, realtimeGenerationCost: 30, realtimeImageCount: 200, batchGenerationCost: 11, batchImageCount: 140 }
  if (name === "bulkOperations:list") {
    const filtered = operations.filter(job => args.operation === "all" || !args.operation || job.operation === args.operation)
    const offset = args.cursor ? 20 : 0, limit = Number(args.limit ?? 20)
    return { page: filtered.slice(offset, offset + limit), hasNext: offset + limit < filtered.length, continueCursor: offset + limit < filtered.length ? { fixture: "page-2" } : null }
  }
  if (name === "bulkTransforms:get") {
    const row = operations.find(job => job.id === args.jobId)
    const previewItems = workspaceImages("product-1").slice(0, 2).map((image, i) => ({
      _id: `transform-image-${i}`, productTitle: "Rideau en lin naturel", referencedProductCount: 1, sourceUrl: image.storageUrl, outputUrl: image.storageUrl, status: "transformed", sourcePosition: i + 1,
    }))
    return { job: { ...mirror, _id: args.jobId, status: row?.status ?? "ready", error: row?.details.error }, previewItems, errorItems: [], productErrors: [] }
  }
  if (name === "bulkReorders:get") {
    const row = operations.find(job => job.id === args.jobId)
    return { job: { ...reorder, _id: args.jobId, restoreStatus: row?.restoreStatus ?? undefined, restoredItems: row?.restoredItems, restoreConflictItems: row?.restoreIssueItems, restoreTotalItems: row?.restoreStatus ? 12 : undefined }, items: [], errorItems: [] }
  }
  return undefined
}
export function mutateActivity(name: string, args: Record<string, unknown>) {
  if (name === "shops:connect") {
    if (args.clientSecret === "simulate-error") throw new Error("Erreur simulée : enregistrement temporairement indisponible.")
    const existing = shops.find(shop => shop.domain === args.domain)
    const next: ShopRow = { _id: existing?._id ?? `shop-fixture-${shops.length}` as Id<"shops">, domain: String(args.domain), storeHandle: String(args.domain).split(".")[0], name: String(args.name), productQuery: String(args.productQuery), hasClientCredentials: true, isActive: true, source: "database" }
    shops = [...shops.filter(shop => shop._id !== next._id).map(shop => ({ ...shop, isActive: false })), next]
    workspaceLog.push(`shops:connect ${next.domain} · identifiants masqués · simulation locale`)
    return next._id
  }
  if (name === "shops:setActive") { shops = shops.map(shop => ({ ...shop, isActive: shop._id === args.shopId })); return null }
  if (name === "settings:set") { settings[String(args.key)] = args.value; return null }
  if (name === "shopify:authorizationStatus") {
    const shop = shops.find(shop => shop._id === args.shopId)!
    return { shopDomain: shop.domain, status: "granted", scopes: { missing: [], requested: [], granted: ["read_products", "write_products", "read_files", "write_files"] }, authorizationUrl: null, checkedAt: Date.now() }
  }
  return undefined
}
