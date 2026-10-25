import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { kindLabels, metricsFor, priorityFor, statusLabels, type Keyword, type SeoConfig, type SeoDocument } from "../types"
import { orderedNodes } from "../lib/editor"

const number = (n: number | null) => n === null ? "—" : n.toLocaleString("fr-FR")
export function SeoTree({ document, keywords, config, selectedId, onSelect }: {
  document: SeoDocument; keywords: Keyword[]; config: SeoConfig; selectedId: string | null; onSelect: (id: string) => void
}) {
  const collectionMenu = document.analysisVersion === 2
  return <div className="studio-panel min-w-0 overflow-auto"><Table><TableHeader><TableRow>
    <TableHead>{collectionMenu ? "Collection et hiérarchie du menu" : "Page et hiérarchie"}</TableHead><TableHead>Type</TableHead><TableHead>Priorité</TableHead><TableHead>Volume principal source</TableHead><TableHead>Somme déclarée</TableHead><TableHead>Validation</TableHead>
  </TableRow></TableHeader><TableBody>{orderedNodes(document.nodes).map(({ node, depth }) => {
    const metrics = metricsFor(node, keywords, document.assignments, document.analysisVersion ?? 1)
    const priority = collectionMenu && node.kind === "group" ? null : priorityFor(node, keywords, document.assignments, config, document.analysisVersion ?? 1)
    return <TableRow key={node.id} data-state={selectedId === node.id ? "selected" : undefined}>
      <TableCell><div style={{ paddingLeft: depth * 20 }}><Button variant="ghost" onClick={() => onSelect(node.id)} aria-pressed={selectedId === node.id} className="h-auto max-w-80 justify-start whitespace-normal text-left">
        {node.title}</Button><p className="mt-1 max-w-80 truncate text-xs text-muted-foreground">{collectionMenu && node.kind === "group" ? "Libellé d’organisation, sans collection à créer" : keywords.find(k => k.key === node.primaryKey)?.keyword ?? "Hypothèse sans mot-clé mesuré"}</p></div></TableCell>
      <TableCell>{kindLabels[node.kind]}</TableCell><TableCell>{priority ? <Badge variant="outline">{priority}</Badge> : "—"}</TableCell>
      <TableCell>{number(metrics.primaryVolume)}</TableCell><TableCell>{number(metrics.declaredVolume)}</TableCell><TableCell>{statusLabels[node.status]}</TableCell>
    </TableRow>
  })}</TableBody></Table><p className="border-t p-4 text-xs text-muted-foreground">Volumes de {config.sourceCountry}, issus uniquement de l’Excel. Les sommes sont indicatives, sans cumul des collections parentes ni estimation de visiteurs uniques.{collectionMenu && " La priorité dépend du volume principal ; l’intention et le KD restent indicatifs. Les regroupements n’ont ni volume ni priorité."}</p></div>
}
