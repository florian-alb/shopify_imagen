// Real UI and hooks, in-memory data only. This file is outside the production routes.
import { useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { ConvexAuthProvider } from "@convex-dev/auth/react"
import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet, useLocation } from "@tanstack/react-router"
import { Toaster } from "sonner"
import { TooltipProvider } from "../app/components/ui/tooltip"
import { AppShell } from "../app/components/app-shell/AppShell"
import { ProductsPage } from "../app/features/products/components/ProductsPage"
import { ProductDetailPage } from "../app/features/products/components/ProductDetailPage"
import { validateProductWorkspaceSearch } from "../app/features/products/lib/productWorkspaceSearch"
import { workspaceImages, workspaceProduct, workspaceGroups, mutateWorkspace, workspaceLog, workspaceListeners } from "./product_workspace_fixture"
import { CatalogHome } from "../app/features/catalog-import/components/CatalogHome"
import { SeoHome } from "../app/features/seo/components/SeoHome"
import { readActivity, mutateActivity } from "./activity_settings_fixture"
import { SettingsPage } from "../app/features/settings/components/SettingsPage"
import { validateSettingsSearch } from "../app/features/settings/lib/settingsSearch"
import { BulkOperationsPage } from "../app/features/bulk-operations/components/BulkOperationsPage"
import { validateBulkOperationSearch } from "../app/features/bulk-operations/lib/bulkOperationSearch"
import { JobDetailPage } from "../app/features/jobs/components/JobDetailPage"
import { validateJobDetailSearch } from "../app/features/jobs/lib/jobDetailSearch"
import { validateJobSearch } from "../app/features/jobs/lib/jobSearch"
import { JobsPage } from "../app/features/jobs/components/JobsPage"
import { validateProductSearch } from "../app/lib/productFilters"
import type { ProductListItem } from "../app/features/products/types"
import type { Doc, Id } from "../app/lib/convex"
import "../app/styles.css"

const products: ProductListItem[] = Array.from({ length: 24 }, (_, i) => ({
  _id: `product-${i}` as Id<"products">, _creationTime: 1, shopifyProductId: String(i),
  title: ["Rideau en lin naturel", "Voilage en coton blanc", "Rideau occultant sable", "Rideau en velours olive", "Voilage à fines rayures", "Rideau à œillets terracotta"][i % 6] + (i > 5 ? ` · ${i + 1}` : ""),
  handle: `rideau-${i}`, productType: i % 2 ? "Voilages" : "Rideaux", vendor: "Maison Atelier",
  shopifyStatus: i % 3 ? "ACTIVE" : "DRAFT", shopifyImageCount: 4,
  generationStatus: "not_started", generationState: i % 3 ? "complete" : "not_started",
  reviewState: i % 3 === 1 ? "needs_review" : "approved", publishState: i % 3 === 2 ? "pushed" : "not_ready",
  primaryAction: ["generate", "review", "done", "push", "wait", "fix_errors"][i % 6] as ProductListItem["primaryAction"],
  generatedImageCount: i % 3 ? 6 : 0, pendingReviewCount: i % 3 === 1 ? 3 : 0,
  failedImageCount: i % 6 === 5 ? 1 : 0,
}))
const prompts: Doc<"promptTemplates">[] = ["Ambiance", "Détail textile", "Vue de face"].map((label, i) => ({
  _id: `prompt-${i}` as Id<"promptTemplates">, _creationTime: 1, imageType: `type-${i}`, label,
  content: "Fixture", defaultContent: "Fixture", isActive: true, isPreset: i < 2, position: i, createdAt: 1, updatedAt: 1,
}))
function read(name: string, args: Record<string, unknown>) {
  const activity = readActivity(name, args, products.map(workspaceProduct))
  if (activity !== undefined) return activity
  if (name === "products:getWithImages") {
    const product = products.find(p => p._id === args.productId)
    return product ? { product: workspaceProduct(product), images: workspaceImages(product._id) } : null
  }
  if (name === "visualGroups:getForProduct") return workspaceGroups(String(args.productId))
  if (name === "products:facets") return { productTypes: ["Rideaux", "Voilages"], collections: [{ id: "collection", title: "Essentiels" }], shopifyStatuses: ["ACTIVE", "DRAFT"] }
  if (name === "products:list" || name === "products:navigation") {
    const rows = products.filter(p => (!args.search || p.title.toLowerCase().includes(String(args.search).toLowerCase())) &&
      (!args.primaryAction || p.primaryAction === args.primaryAction) && (!args.productType || p.productType === args.productType) &&
      (!args.generationState || p.generationState === args.generationState) && (!args.reviewState || p.reviewState === args.reviewState) &&
      (!args.publishState || p.publishState === args.publishState) && (!args.shopifyStatus || p.shopifyStatus === args.shopifyStatus))
    const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 20)
    const index = rows.findIndex(p => p._id === args.productId)
    return name === "products:navigation" ? { total: rows.length, position: index + 1, previous: rows[index - 1] ?? null, next: rows[index + 1] ?? null } : { page: rows.slice(offset, offset + limit), total: rows.length, hasPrevious: offset > 0, hasNext: offset + limit < rows.length }
  }
  if (name === "prompts:list") return prompts
  if (name === "bulkTransforms:productLocks") return []
  if (name.endsWith(":latestUndismissed")) return null
  if (name === "bulkOperations:hasUndismissed") return false
  if (name === "jobs:preview") return { totalImages: (args.productIds as unknown[]).length * (args.selectedImageTypes as unknown[]).length * (args.variantSelection === "all" ? 3 : 1), separatedProductCount: 0 }
  if (name === "bulkTransforms:selectionOptions") return { productCount: (args.productIds as unknown[]).length, unavailableProductCount: 0, lockedProducts: [], positions: [1, 2, 3].map(position => ({ position, productCount: 1, unlockedProductCount: 1, previews: [] })) }
  if (name === "catalogues:list") return "[]"
  if (name === "seoProjects:list") return []
  throw new Error(`Unsupported fixture query: ${name}`)
}
const cache = new Map<string, unknown>()
function cached(name: string, args: Record<string, unknown>) {
  const key = JSON.stringify([name, args])
  if (!cache.has(key)) cache.set(key, read(name, args))
  return cache.get(key)
}
const client = {
  address: "https://fixture.invalid", logger: console, setAuth() {}, clearAuth() {},
  watchQuery(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) {
    return { localQueryResult: () => cached(getFunctionName(ref), args), onUpdate: (callback: () => void) => { workspaceListeners.add(callback); return () => workspaceListeners.delete(callback) }, journal: () => undefined }
  },
  async mutation(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) { return simulate(ref, args) },
  async action(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) { return simulate(ref, args) },
} as unknown as ConvexReactClient
function simulate(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) {
  const activity = mutateActivity(getFunctionName(ref), args)
  const result = activity !== undefined ? activity : mutateWorkspace(getFunctionName(ref), args)
  cache.clear()
  workspaceListeners.forEach(callback => callback())
  return result
}
function FixtureStatus() {
  const href = useLocation({ select: location => location.href })
  const log = useSyncExternalStore(callback => { workspaceListeners.add(callback); return () => workspaceListeners.delete(callback) }, () => workspaceLog.join("\n"))
  return <aside className="border-t bg-muted p-3 text-xs"><output aria-label="Adresse de travail">{href}</output><details><summary>Journal des simulations locales</summary><pre className="overflow-auto">{log || "Aucune action"}</pre></details></aside>
}
const root = createRootRoute({ component: () => <AppShell><div className="bg-info-subtle px-4 py-1.5 text-center text-xs text-info">Vérification locale · données fictives · actions simulées, aucune écriture externe</div><Outlet /><FixtureStatus /></AppShell> })
const productsRoute = createRoute({ getParentRoute: () => root, path: "/products", validateSearch: validateProductSearch, component: () => <ProductsPage search={productsRoute.useSearch()} /> })
const productRoute = createRoute({ getParentRoute: () => root, path: "/products/$productId", validateSearch: validateProductWorkspaceSearch, component: () => {
  const { productId } = productRoute.useParams()
  return <ProductDetailPage key={productId} productId={productId} search={productRoute.useSearch()} />
} })
const catalogRoute = createRoute({ getParentRoute: () => root, path: "/catalog-import", component: CatalogHome })
const seoRoute = createRoute({ getParentRoute: () => root, path: "/seo", component: SeoHome })
const jobsRoute = createRoute({ getParentRoute: () => root, path: "/jobs", validateSearch: validateJobSearch, component: () => <JobsPage search={jobsRoute.useSearch()} /> })
const jobRoute = createRoute({ getParentRoute: () => root, path: "/jobs/$jobId", validateSearch: validateJobDetailSearch, component: () => <JobDetailPage key={jobRoute.useParams().jobId} jobId={jobRoute.useParams().jobId} search={jobRoute.useSearch()} /> })
const settingsRoute = createRoute({ getParentRoute: () => root, path: "/settings", validateSearch: validateSettingsSearch, component: () => <SettingsPage search={settingsRoute.useSearch()} /> })
const bulkRoute = createRoute({ getParentRoute: () => root, path: "/bulk-operations", validateSearch: validateBulkOperationSearch, component: () => <BulkOperationsPage search={bulkRoute.useSearch()} /> })
const router = createRouter({ routeTree: root.addChildren([productsRoute, productRoute, catalogRoute, seoRoute, jobsRoute, jobRoute, settingsRoute, bulkRoute]), history: createMemoryHistory({ initialEntries: [new URL(window.location.href).searchParams.get("route") ?? "/products"] }) })
createRoot(document.getElementById("root")!).render(<ConvexAuthProvider client={client} storageNamespace="design-fixture" shouldHandleCode={false}><TooltipProvider><RouterProvider router={router} /></TooltipProvider><Toaster /></ConvexAuthProvider>)
