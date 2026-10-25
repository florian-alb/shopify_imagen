import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { Catalogue } from "../types"
import type { Collection } from "../../../../convex/catalogue/model"

function collectionStatus(col: Collection) {
  if (col.ignored) return "Ignorée"
  if (col.membership === "failed") return "À relancer"
  if (col.membership !== "complete") return "À vérifier"
  return col.selectedCount === 0 ? "Vide" : "Vérifiée"
}

export function CatalogCollections({ c, showProducts, editTags, run, busy }: {
  c: Catalogue
  showProducts: (key: string) => void
  editTags: () => void
  run: (fn: () => Promise<unknown>) => Promise<void>
  busy: boolean
}) {
  const [filter, setFilter] = useState("all")
  const [adding, setAdding] = useState<string | null>(null)
  const add = useMutation(api.catalogues.addCollection)
  const collections = c.structure.collections.filter((col) =>
    filter === "all" ||
    (filter === "active" && !col.ignored) ||
    (filter === "ignored" && col.ignored) ||
    (filter === "empty" && !col.selectedCount && col.membership === "complete") ||
    (filter === "outside" && col.outsideMenu) ||
    (filter === "failed" && col.membership === "failed"),
  )
  return (
    <section className="px-4 py-5 md:px-6 xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Filtrer les collections" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Toutes</option>
          <option value="active">Actives</option>
          <option value="ignored">Ignorées</option>
          <option value="empty">Vides</option>
          <option value="outside">Hors menu</option>
          <option value="failed">À relancer</option>
        </select>
        <Button variant="outline" disabled={busy || c.work?.kind === "import" || c.work?.kind === "export"} onClick={editTags}>
          Tags et exclusions
        </Button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              {["Collection", "Tags", "Catalogue / Source", "Menu", "État", "Action"].map((label) => (
                <th key={label} className="p-3 font-normal">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {collections.map((col) => (
              <tr className="border-b" key={col.key}>
                <td className="p-3 font-medium">{col.title}</td>
                <td className="p-3">{col.ignored ? "—" : col.tag || "—"}</td>
                <td className="p-3 tabular-nums">
                  {col.ignored ? col.selectedCount : <button className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Voir les produits de ${col.title}`} onClick={() => showProducts(col.key)}>{col.selectedCount}</button>}
                  {" / "}{col.membership === "complete" ? col.count : "Non vérifié"}
                </td>
                <td className="p-3">{col.outsideMenu ? "Hors menu" : "Présente"}</td>
                <td className="p-3">{collectionStatus(col)}</td>
                <td className="p-3">
                  <Button variant="outline" size="sm" disabled={!!c.work || busy} onClick={() => setAdding(col.key)}>
                    Ajouter les produits
                  </Button>
                </td>
              </tr>
            ))}
            {!collections.length && <tr><td colSpan={6} className="p-6 text-muted-foreground">Aucune collection.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter les produits manquants</DialogTitle>
            <DialogDescription>
              {c.mode === "TOP_N" ? `Le catalogue pourra dépasser ${c.topN} produits.` : "Seuls les produits absents seront ajoutés."}
            </DialogDescription>
          </DialogHeader>
          <Button disabled={busy} onClick={() => void run(async () => {
            await add({ id: c._id, key: adding! })
            setAdding(null)
          })}>Ajouter</Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
