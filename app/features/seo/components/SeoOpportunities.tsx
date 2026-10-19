import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SeoDocument } from "../types"

export function SeoOpportunities({ document }: { document: SeoDocument }) {
  const opportunities = document.opportunities ?? []
  return <section className="flex flex-col gap-4 py-2" aria-label="Opportunités hors Excel">
    <div><h2 className="font-semibold">Catégories à étudier séparément</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Repérées chez les concurrents, ces catégories n’ont pas de mot-clé correspondant dans ton export. Elles restent hors du menu. Leur demande n’est pas mesurée ici.</p></div>
    {!opportunities.length ? <p className="text-sm text-muted-foreground">Aucune opportunité supplémentaire retenue dans les menus consultés.</p> :
      <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Catégorie proposée</TableHead><TableHead>Pertinence pour l’offre</TableHead><TableHead>Produits à étudier</TableHead><TableHead>Références concurrentes</TableHead></TableRow></TableHeader>
        <TableBody>{opportunities.map(opportunity => <TableRow key={opportunity.id}>
          <TableCell className="min-w-48 font-medium">{opportunity.title}</TableCell>
          <TableCell className="min-w-64 whitespace-normal">{opportunity.rationale}</TableCell>
          <TableCell className="min-w-48 whitespace-normal">{opportunity.products.join(", ") || "À préciser"}</TableCell>
          <TableCell className="min-w-48"><ul className="flex flex-col gap-2">{opportunity.sourceIds.map(id => {
            const source = document.sources.find(s => s.id === id)
            return source ? <li key={id}><a href={source.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{source.title || source.url}</a></li> : null
          })}</ul></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
  </section>
}
