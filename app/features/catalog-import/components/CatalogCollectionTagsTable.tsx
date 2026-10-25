import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { CollectionTagInput } from "./CollectionTagInput"
import { cn } from "@/lib/utils"
import type { Collection } from "../../../../convex/catalogue/model"
import type { CollectionTagEdit } from "../hooks/use-catalog-tags"

export function CatalogCollectionTagsTable({ collections, errors, busy, edit }: {
  collections: Collection[]
  errors: Map<string, string | null>
  busy: boolean
  edit: (values: Record<string, CollectionTagEdit>) => void
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<string[]>([])
  const visible = collections.filter((col) => col.title.toLowerCase().includes(search.toLowerCase()) &&
    (filter === "all" || (filter === "ignored" ? col.ignored : !col.ignored)))
  const chosen = visible.filter((col) => selected.includes(col.key))
  const ignored = collections.filter((col) => col.ignored).length
  function setIgnored(keys: string[], value: boolean) {
    edit(Object.fromEntries(keys.map((key) => [key, { ignored: value }])))
  }
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" aria-label="Rechercher une collection" placeholder="Rechercher une collection" value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected([]) }} />
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Afficher les collections" value={filter} onChange={(e) => { setFilter(e.target.value); setSelected([]) }}>
          <option value="all">Toutes ({collections.length})</option>
          <option value="active">Actives ({collections.length - ignored})</option>
          <option value="ignored">Ignorées ({ignored})</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm" role="status">{chosen.length} sélectionnée(s)</span>
        <Button variant="outline" size="sm" disabled={busy || !chosen.some((col) => !col.ignored)}
          onClick={() => setIgnored(chosen.map((col) => col.key), true)}>Ignorer la sélection</Button>
        <Button variant="outline" size="sm" disabled={busy || !chosen.some((col) => col.ignored)}
          onClick={() => setIgnored(chosen.map((col) => col.key), false)}>Réactiver la sélection</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3"><Checkbox aria-label="Sélectionner toutes les collections affichées" disabled={busy || !visible.length}
                checked={chosen.length === visible.length && !!visible.length ? true : chosen.length ? "indeterminate" : false}
                onCheckedChange={(checked) => setSelected(checked === true ? visible.map((col) => col.key) : [])} /></th>
              <th className="p-3">Collection</th>
              <th className="min-w-64 p-3">Tags</th>
              <th className="p-3">Sélection / Source</th>
              <th className="p-3">Menu</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((col) => (
              <tr key={col.key} className={cn("border-b", col.ignored && "bg-muted/30 text-muted-foreground")}>
                <td className="p-3"><Checkbox aria-label={`Sélectionner ${col.title}`} disabled={busy} checked={selected.includes(col.key)}
                  onCheckedChange={(checked) => setSelected((current) => checked === true ? [...current, col.key] : current.filter((key) => key !== col.key))} /></td>
                <td className="p-3">{col.title}{col.ignored && <Badge variant="secondary" className="ml-2">Ignorée</Badge>}</td>
                <td className="p-3">
                  {col.ignored ? <span>Aucun tag appliqué</span> : <>
                    <CollectionTagInput title={col.title} invalid={Boolean(errors.get(col.key))} describedBy={errors.get(col.key) ? `tag-status-${col.key}` : undefined}
                      value={col.tag} disabled={busy} onChange={(tag) => edit({ [col.key]: { tag } })} />
                    {errors.get(col.key) && <span id={`tag-status-${col.key}`} className="mt-1 block text-xs">{errors.get(col.key)}</span>}
                  </>}
                </td>
                <td className="p-3">{col.selectedCount} / {col.membership === "complete" ? col.count : "Non vérifié"}</td>
                <td className="p-3">{col.outsideMenu ? "Hors menu" : "Présente"}</td>
                <td className="p-3"><Button variant="outline" size="sm" disabled={busy}
                  aria-label={`${col.ignored ? "Réactiver" : "Ignorer"} ${col.title}`}
                  onClick={() => setIgnored([col.key], !col.ignored)}>{col.ignored ? "Réactiver" : "Ignorer"}</Button></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={6} className="p-6 text-muted-foreground">Aucune collection ne correspond aux filtres.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
