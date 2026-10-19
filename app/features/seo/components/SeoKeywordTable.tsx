import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { intents, intentLabels, relevanceLabels, type Assignment, type Keyword, type SeoDocument } from "../types"
import { SeoSelect } from "./SeoSelect"

export function SeoKeywordTable({ document, keywords, onChange }: {
  document: SeoDocument; keywords: Keyword[]; onChange: (key: string, changes: Partial<Assignment>) => void
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const collectionMenu = document.analysisVersion === 2
  const destinations = document.nodes.filter(n => !collectionMenu || n.kind === "collection")
  const rows = document.assignments.filter(a => (filter === "all" || a.relevance === filter) && keywords.find(k => k.key === a.key)?.keyword.toLowerCase().includes(search.toLowerCase()))
  return <section className="flex min-w-0 flex-col gap-4">
    {collectionMenu && <p className="text-sm text-muted-foreground">Les expressions et métriques viennent de l’Excel. L’intention sert d’aide : la pertinence dépend des produits recherchés et de ton offre. Les recherches d’écoles, services ou contenus restent hors du menu.</p>}
    <div className="flex flex-wrap items-end gap-4"><Input className="max-w-sm" aria-label="Rechercher un mot-clé" placeholder="Rechercher un mot-clé…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="w-48"><SeoSelect label="Pertinence" value={filter} onChange={setFilter} options={[{ value: "all", label: "Toutes" }, ...Object.entries(relevanceLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <p className="pb-2 text-sm text-muted-foreground">{rows.length} / {keywords.length} lignes</p></div>
    <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Expression et source</TableHead><TableHead>Volume source</TableHead><TableHead>{collectionMenu ? "Intention indicative" : "Intention IA"}</TableHead><TableHead>Pertinence</TableHead><TableHead>{collectionMenu ? "Collection" : "Page principale"}</TableHead><TableHead>Raison</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(a => {
        const k = keywords.find(k => k.key === a.key)!
        return <TableRow key={a.key}>
          <TableCell className="min-w-52"><p className="font-medium">{k.keyword}</p><p className="mt-1 text-xs text-muted-foreground">Ligne {k.row} · Intention source : {k.intent || "absente"} · KD {k.kd ?? "—"} · CPC {k.cpc ?? "—"} USD</p>
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Valeurs originales</summary><p className="mt-2 max-w-xs break-words">{k.raw.map(v => v === null ? "n/a" : String(v)).join(" | ")}</p></details></TableCell>
          <TableCell>{k.volume?.toLocaleString("fr-FR") ?? "—"}</TableCell>
          <TableCell className="min-w-44"><SeoSelect label={`Intention : ${k.keyword}`} value={a.inferredIntent} options={intents.map(i => ({ value: i, label: intentLabels[i] }))} onChange={v => onChange(a.key, { inferredIntent: v as Assignment["inferredIntent"] })} /></TableCell>
          <TableCell className="min-w-40"><SeoSelect label={`Pertinence : ${k.keyword}`} value={a.relevance} options={Object.entries(relevanceLabels).map(([value, label]) => ({ value, label }))} onChange={v => onChange(a.key, { relevance: v as Assignment["relevance"] })} /></TableCell>
          <TableCell className="min-w-52"><SeoSelect label={`${collectionMenu ? "Collection" : "Page"} : ${k.keyword}`} value={a.nodeId ?? ""} options={[{ value: "", label: collectionMenu ? "Hors du menu" : "Sans page" }, ...destinations.map(n => ({ value: n.id, label: n.title }))]}
            onChange={v => onChange(a.key, { nodeId: v || null, ...(v && a.relevance === "excluded" ? { relevance: "review" as const } : {}) })} /></TableCell>
          <TableCell className="min-w-60"><Input aria-label={`Raison : ${k.keyword}`} value={a.reason} onChange={e => onChange(a.key, { reason: e.target.value })} maxLength={2000} /></TableCell>
        </TableRow>
      })}</TableBody></Table></div>
  </section>
}
