// Actual feature components with an in-memory Convex client. No backend or Shopify writes.
import { createRoot } from "react-dom/client"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router"
import { CatalogHome } from "../app/features/catalog-import/components/CatalogHome"
import { CatalogWorkspace } from "../app/features/catalog-import/components/CatalogWorkspace"
import {
  effective,
  type Structure,
  type CatalogProduct,
} from "../convex/catalogue/model"
import type { Id } from "../convex/_generated/dataModel"
import raw from "../convex/catalogue/fixtures/kuscheltierland.json"
import "../app/styles.css"

const id = "fixture-catalogue" as Id<"catalogues">
const structure: Structure = {
  menu: [
    {
      key: "animals",
      title: "Tiere",
      url: null,
      children: [
        {
          key: "birds",
          title: "Vögel",
          url: "https://source.example/collections/birds",
          children: [],
        },
      ],
    },
  ],
  collections: ["birds", "soft-toys", "empty"].map((key, i) => ({
    key,
    url: `https://source.example/collections/${key}`,
    title: ["Vögel", "Kuscheltiere", "Neuheiten"][i],
    description: "",
    image: null,
    tag: ["bird", "soft toy", "new arrival"][i],
    validated: true,
    outsideMenu: i > 0,
    membership: "complete",
    count: [3, 7, 0][i],
    selectedCount: [2, 2, 0][i],
  })),
  warnings: [],
}
let catalogue = {
  _id: id,
  origin: "https://source.example",
  mode: "TOP_N",
  topN: 4,
  status: "ready",
  phase: "ready",
  structure,
  work: null,
  version: 1,
  generation: 1,
  total: 4,
  complete: 3,
  failed: 1,
  sourceCount: 10,
  initialCount: 4,
  createdAt: 1,
  updatedAt: 1,
  exportVersion: 0,
  lastImport: null as unknown,
}
const rows = [
  "Kuscheltier Taube – Flauschiger Vogel",
  "Kuscheltier Capybara – Schlafkissen",
  "Kuscheltier Otter – 30 cm",
  "Kuscheltier Faultier",
].map((title, i) => ({
  _id: `fixture-${i}` as Id<"produits">,
  catalogueId: id,
  handle: `product-${i}`,
  url: `https://source.example/products/product-${i}`,
  title,
  rank: i + 1,
  state: i === 3 ? "failed" : "complete",
  collections:
    i === 3
      ? []
      : i === 0
        ? ["birds", "soft-toys"]
        : i === 1
          ? ["birds"]
          : ["soft-toys"],
  error:
    i === 3
      ? "HTML : délai de lecture dépassé après trois tentatives."
      : undefined,
  jsonSource: JSON.stringify(raw),
  override: {} as { title?: string; tags?: string[]; excluded?: boolean },
  remote: null,
}))
// Reproduce the sparse collection that exposed the display-page pagination bug.
if (
  new URL(window.location.href).searchParams.get("scenario") === "pagination"
) {
  const template = rows[1]
  rows.splice(
    0,
    rows.length,
    ...Array.from({ length: 964 }, (_, i) => ({
      ...template,
      _id: `fixture-${i}` as Id<"produits">,
      handle: `product-${i}`,
      url: `https://source.example/products/product-${i}`,
      title: `${i < 960 && i % 24 === 1 ? "Capybara" : "Autre produit"} ${String(i + 1).padStart(3, "0")}`,
      rank: i + 1,
      collections: i < 960 && i % 24 === 1 ? ["capybara"] : [],
    })),
  )
  structure.collections = [
    {
      ...structure.collections[0],
      key: "capybara",
      title: "Capybara Kuscheltier",
      url: "https://source.example/collections/capybara",
      tag: "capybara",
      count: 40,
      selectedCount: 40,
    },
  ]
  catalogue.mode = "ALL"
  catalogue.total = catalogue.complete = catalogue.sourceCount = 964
  catalogue.failed = 0
}
function data(p: (typeof rows)[number]): CatalogProduct {
  return {
    key: p.handle,
    handle: p.handle,
    sourceId: p._id,
    url: p.url,
    title: p.title,
    description: "<p>Weiches Kuscheltier für gemütliche Momente.</p>",
    vendor: "Exemple",
    productType: "Kuscheltier",
    sourceTags: [],
    options: [{ name: "Taille", values: ["23 cm"] }],
    variants: [
      {
        id: "variant",
        title: "23 cm",
        sku: "DEMO-23",
        price: "24.90",
        currency: "EUR",
        compareAtPrice: null,
        options: ["23 cm"],
        weight: 0,
        weightUnit: "g",
        imageId: null,
      },
    ],
    images: [
      {
        id: "image",
        url: raw.product.images[0].src,
        alt: p.title,
        position: 1,
      },
    ],
    sections: [
      {
        title: "Produktdetails",
        html: "<p>Größe: 23 cm<br>Füllung: PP Cotton</p>",
      },
      { title: "Pflege", html: "<p>Schonend mit der Hand waschen.</p>" },
      {
        title: "Hinweise Zur Verwendung",
        html: "<p>Von Feuer fernhalten.</p>",
      },
    ],
    seo: { title: p.title, description: "", canonical: p.url },
    collections: p.collections,
    jsonStatus: "complete",
    htmlStatus: p.state === "failed" ? "failed" : "complete",
    errors: p.error ? [p.error] : [],
    warnings: [],
    fetchedAt: 1,
  }
}
const listeners = new Set<() => void>()
function query(name: string, a: Record<string, unknown>) {
  if (name === "catalogues:list") return JSON.stringify([{ id, ...catalogue }])
  if (name === "catalogues:get") return JSON.stringify(catalogue)
  if (name === "catalogues:destinationShops")
    return JSON.stringify([
      {
        id: "fixture-shop",
        name: "Boutique de test",
        domain: "fixture.myshopify.com",
      },
    ])
  if (name === "catalogues:products") {
    const opts = a.paginationOpts as {
      numItems: number
      cursor: string | null
      endCursor?: string
    }
    const ordered = [...rows].sort((aRow, bRow) =>
      a.sort === "title"
        ? aRow.title.localeCompare(bRow.title)
        : a.sort === "state"
          ? aRow.state.localeCompare(bRow.state)
          : aRow.rank - bRow.rank,
    )
    const start = Number(opts.cursor ?? 0)
    const end = opts.endCursor
      ? Number(opts.endCursor)
      : Math.min(start + opts.numItems, ordered.length)
    return {
      page: ordered
        .slice(start, end)
        .filter(
          (p) =>
            (!a.search ||
              p.title.toLowerCase().includes(String(a.search).toLowerCase())) &&
            (!a.state || a.state === p.state) &&
            (!a.collection ||
              (a.collection === "__none"
                ? !p.collections.length
                : p.collections.includes(String(a.collection)))),
        )
        .map((p) =>
          JSON.stringify({
            ...p,
            id: p._id,
            image: data(p).images[0].url,
            tags: effective(data(p), structure, p.override).tags,
          }),
        ),
      continueCursor: String(end),
      isDone: end >= ordered.length,
    }
  }
  if (name === "catalogues:product") {
    const p = rows.find((p) => p._id === a.productId)!
    return JSON.stringify({
      ...p,
      data: effective(data(p), structure, p.override),
    })
  }
  throw new Error(`Unsupported fixture query: ${name}`)
}
const client = {
  watchQuery(
    ref: Parameters<typeof getFunctionName>[0],
    a: Record<string, unknown>,
  ) {
    return {
      localQueryResult: () => query(getFunctionName(ref), a),
      onUpdate(cb: () => void) {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      journal: () => undefined,
    }
  },
  async mutation(
    ref: Parameters<typeof getFunctionName>[0],
    a: Record<string, unknown>,
  ) {
    const name = getFunctionName(ref)
    if (name === "catalogues:saveProduct") {
      const p = rows.find((p) => p._id === a.productId)!
      p.override = a.override as typeof p.override
      if (p.override.title) p.title = p.override.title
    } else if (name === "catalogues:saveTags") {
      for (const v of a.values as Array<{ key: string; tag: string }>) {
        const col = structure.collections.find((c) => c.key === v.key)!
        col.tag = v.tag
        col.validated = Boolean(a.validate)
      }
      if (a.collect) catalogue.status = "ready"
    } else if (name === "catalogues:retry") {
      rows.forEach((p) => {
        p.state = "complete"
        p.error = undefined
      })
      catalogue.complete = 4
      catalogue.failed = 0
    } else if (name === "catalogues:exportJson")
      catalogue.exportVersion = catalogue.version + 1
    else if (name === "catalogues:create") {
      catalogue = {
        ...catalogue,
        mode: String(a.mode),
        topN: Number(a.topN ?? 4),
        status: "tags",
      }
      structure.collections.forEach((c) => (c.validated = false))
    } else if (name === "catalogues:startImport")
      throw new Error("Simulation : aucun import Shopify réel n’est exécuté.")
    else if (name !== "catalogues:addCollection")
      throw new Error(`Unsupported fixture mutation: ${name}`)
    catalogue.version++
    listeners.forEach((cb) => cb())
    return name === "catalogues:create" ? id : null
  },
  async action(ref: Parameters<typeof getFunctionName>[0]) {
    if (getFunctionName(ref) === "catalogueActions:suggestTags")
      return structure.collections.map((c) => ({ key: c.key, tag: c.tag }))
    throw new Error("Simulation : pas de téléchargement R2.")
  },
} as unknown as ConvexReactClient
const root = createRootRoute({
  component: () => (
    <>
      <div className="border-b bg-amber-50 p-2 text-center text-xs text-black">
        Vérification isolée · données simulées · aucun appel Convex ou Shopify{" "}
        <button
          className="ml-2 underline"
          onClick={() => document.documentElement.classList.toggle("dark")}
        >
          Clair / sombre
        </button>
      </div>
      <Outlet />
    </>
  ),
})
const home = createRoute({
  getParentRoute: () => root,
  path: "/catalog-import",
  component: CatalogHome,
})
const workspace = createRoute({
  getParentRoute: () => root,
  path: "/catalog-import/$exportId",
  component: () => <CatalogWorkspace id={id} />,
})
const router = createRouter({
  routeTree: root.addChildren([home, workspace]),
  history: createMemoryHistory({
    initialEntries: ["/catalog-import/fixture-catalogue"],
  }),
})
createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={client}>
    <RouterProvider router={router} />
  </ConvexProvider>,
)
