// Isolated UI verification. Fixture data, no network calls or authentication bypass.
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router"
import { SeoWorkspace } from "../app/features/seo/components/SeoWorkspace"
import { SeoHome } from "../app/features/seo/components/SeoHome"
import { defaultConfig, type Keyword, type SeoConfig, type SeoDocument } from "../convex/seo/model"
import { Toaster } from "../app/components/ui/sonner"
import "../app/styles.css"

type Qualification = SeoDocument & { config: SeoConfig; keywords: Keyword[]; headers: string[]; filename: string; model: string }
const qualification: Qualification | null = new URLSearchParams(window.location.search).has("montessori")
  ? await fetch("/output/seo-poc/v2/montessori.json").then(response => {
    if (!response.ok) throw new Error("Résultat Montessori v2 absent. Exécuter le script de qualification avant cet écran.")
    return response.json()
  }) : null
let keywords: Keyword[] = qualification?.keywords ?? [
  { key: "row-2", row: 2, keyword: "montessori spielzeug 1 jahr", intent: "C", volume: 2400, kd: 22, cpc: 0.22, raw: ["montessori spielzeug 1 jahr", "C", 2400] },
  { key: "row-3", row: 3, keyword: "montessori spielzeug ab 1 jahr", intent: "C", volume: 1000, kd: 17, cpc: 0.22, raw: ["montessori spielzeug ab 1 jahr", "C", 1000] },
  { key: "row-4", row: 4, keyword: "montessori schule", intent: "C", volume: 4400, kd: 39, cpc: 1.06, raw: ["montessori schule", "C", 4400] },
  { key: "row-5", row: 5, keyword: "maria montessori", intent: "I", volume: 6600, kd: 17, cpc: 0.29, raw: ["maria montessori", "I", 6600] },
]
const document: SeoDocument = qualification ? {
  analysisVersion: qualification.analysisVersion, nodes: qualification.nodes, assignments: qualification.assignments,
  sources: qualification.sources, opportunities: qualification.opportunities, warnings: qualification.warnings,
} : {
  nodes: [
    { id: "toys", parentId: null, title: "Montessori Spielzeug", slug: "montessori-spielzeug", kind: "collection", primaryKey: null, intent: "C", rationale: "Regroupement de navigation proposé, à compléter par un export plus large.", products: [], sourceIds: [], origin: "ai", status: "pending", priorityOverride: null },
    { id: "age-one", parentId: "toys", title: "Montessori Spielzeug ab 1 Jahr", slug: "montessori-spielzeug-ab-1-jahr", kind: "collection", primaryKey: "row-2", intent: "C", rationale: "Les deux formulations expriment le même besoin de jouets pour un enfant d’un an.", products: ["Jeux de tri", "Puzzles simples"], sourceIds: [], origin: "keywords", status: "pending", priorityOverride: null },
  ],
  assignments: keywords.map((k, i) => ({ key: k.key, nodeId: i < 2 ? "age-one" : null, relevance: i < 2 ? "relevant" : "excluded", inferredIntent: i < 2 ? "C" : i === 2 ? "C" : "I", reason: i < 2 ? "Demande de produits par âge." : "Hors périmètre de vente de jouets." })),
  sources: [], warnings: ["Données de démonstration uniquement. Aucune analyse IA exécutée.", "Les volumes sont associés au marché source. Les regroupements n’ont pas été vérifiés dans les résultats Google."],
}
const config = qualification?.config ?? { ...defaultConfig, theme: "Montessori — vérification isolée", sourceCountry: "Allemagne", targetCountry: "Allemagne" }
const now = Date.now(), json = JSON.stringify(document)
const project = { _id: "fixture-seo", _creationTime: now, userId: "fixture-user", config,
  filename: qualification?.filename.split(/[\\/]/).pop() ?? "Exemple de vérification.xlsx",
  headers: qualification?.headers ?? ["Mot clé", "Intention", "Volume"], keywordCount: keywords.length, createdAt: now, updatedAt: now }
const version = { _id: "fixture-version", _creationTime: now, projectId: project._id, config, status: "ready", revision: 0,
  analysisVersion: qualification?.analysisVersion, originalJson: json, workingJson: json,
  model: qualification?.model ?? "simulation locale", createdAt: now, updatedAt: now }
const listeners = new Set<() => void>()
let created = false
function query(name: string) {
  if (name === "seoProjects:workspace") return { project, keywords: keywords.map((k, i) => ({ ...k, _id: `fixture-keyword-${i}`, _creationTime: now, projectId: project._id })), versions: created ? [] : [{ ...version }] }
  if (name === "seoProjects:list") return [project]
  if (name === "seoProjects:version") return { ...version }
  throw new Error(`Unsupported fixture query: ${name}`)
}
const client = {
  watchQuery(ref: Parameters<typeof getFunctionName>[0]) {
    return { localQueryResult: () => query(getFunctionName(ref)), onUpdate(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) }, journal: () => undefined }
  },
  async mutation(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) {
    if (getFunctionName(ref) === "seoProjects:create") {
      const imported = args as { config: SeoConfig; filename: string; headers: string[]; keywords: Keyword[] }
      if (imported.config.sourceCountry !== imported.config.targetCountry || imported.config.sourceLanguage !== imported.config.targetLanguage) {
        throw new Error("Le marché doit être commun à l’export et à la boutique.")
      }
      project.config = imported.config; project.filename = imported.filename; project.headers = imported.headers
      project.keywordCount = imported.keywords.length; keywords = imported.keywords; created = true
      listeners.forEach(cb => cb())
      return project._id
    }
    if (getFunctionName(ref) !== "seoProjects:save") throw new Error("Écran isolé : aucune analyse IA ni écriture Convex exécutée.")
    version.workingJson = String(args.documentJson); version.revision++
    listeners.forEach(cb => cb())
    return version.revision
  },
} as unknown as ConvexReactClient
const root = createRootRoute({ component: () => <><div className="border-b bg-muted p-3 text-center text-sm">Vérification locale · client en mémoire · aucun appel Gemini, Convex ou Shopify depuis cet écran</div><Outlet /><Toaster /></> })
const home = createRoute({ getParentRoute: () => root, path: "/seo", component: SeoHome })
const workspace = createRoute({ getParentRoute: () => root, path: "/seo/$projectId", component: () => <SeoWorkspace projectId={project._id} /> })
const router = createRouter({ routeTree: root.addChildren([home, workspace]), history: createMemoryHistory({ initialEntries: [qualification ? "/seo/fixture-seo" : "/seo"] }) })
createRoot(window.document.getElementById("root")!).render(<ConvexProvider client={client}><RouterProvider router={router} /></ConvexProvider>)
