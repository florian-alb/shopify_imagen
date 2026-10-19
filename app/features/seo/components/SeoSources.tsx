import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { SeoDocument, SourceObservation } from "../types"

type MenuEntry = NonNullable<SourceObservation["menu"]>[number]
const menuStatusLabels = { structured: "Menu extrait", partial: "Extraction partielle", unavailable: "Menu inaccessible" }

function SourceMenu({ entries }: { entries: MenuEntry[] }) {
  return <ul className="flex flex-col gap-2 border-l pl-4">{entries.map(entry => <li key={entry.key}>
    {entry.url ? <a href={entry.url} target="_blank" rel="noreferrer" className="break-words underline underline-offset-4">{entry.title}</a> : <span>{entry.title}</span>}
    {entry.children.length > 0 && <div className="mt-2"><SourceMenu entries={entry.children} /></div>}
  </li>)}</ul>
}

export function SeoSources({ document, model }: { document: SeoDocument; model?: string }) {
  return <div className="flex max-w-4xl flex-col gap-6 py-2">
    <section><h2 className="mb-3 font-semibold">Limites de cette analyse</h2>
      {document.warnings.length > 0 ? <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">{document.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">Les volumes décrivent les recherches de l’export, sans prévision de ventes.</p>}
    </section>
    <section><h2 className="font-semibold">Menus concurrents utilisés</h2>
      <p className="mt-1 text-sm text-muted-foreground">Structure et libellés observés dans la langue d’origine. Une extraction partielle peut omettre des catégories ; ces sources ne fournissent aucun volume de recherche.</p>
      {!document.sources.length ? <p className="mt-3 text-sm text-muted-foreground">Analyse réalisée à partir du fichier seul, sans modèle concurrent.</p> :
        <Accordion type="multiple" defaultValue={[document.sources[0].id]} className="mt-3">{document.sources.map(source => <AccordionItem key={source.id} value={source.id}>
          <AccordionTrigger><span className="flex min-w-0 flex-wrap items-center gap-2"><span className="break-all">{source.title || source.url}</span>
            <Badge variant="outline">{source.menuStatus ? menuStatusLabels[source.menuStatus] : "Observation historique"}</Badge></span></AccordionTrigger>
          <AccordionContent><div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm"><a href={source.url} target="_blank" rel="noreferrer" className="break-all">{source.url}</a>
              <p className="text-muted-foreground">{[source.language && `Langue observée : ${source.language}`, source.extraction && `Extraction : ${source.extraction}`].filter(Boolean).join(" · ") || source.kind}</p>
              {source.error && <p className="text-muted-foreground">{source.error}</p>}</div>
            {source.menu?.length ? <SourceMenu entries={source.menu} /> :
              <p className="text-sm text-muted-foreground">Aucune hiérarchie de menu exploitable enregistrée pour cette source.</p>}
            {!source.menu && source.links.length > 0 && <details><summary className="cursor-pointer text-sm">Liens conservés dans cette ancienne observation</summary>
              <ul className="mt-3 flex flex-col gap-2">{source.links.map((link, i) => <li key={`${link.url}-${i}`}><a href={link.url} target="_blank" rel="noreferrer" className="break-all">{link.title || link.url}</a></li>)}</ul>
            </details>}
          </div></AccordionContent>
        </AccordionItem>)}</Accordion>}
    </section>
    <p className="text-xs text-muted-foreground">Modèle : {model ?? "—"}. Le CPC ne prouve pas la rentabilité et le KD mesure la difficulté SEO. L’Excel reste la source des mots-clés et des métriques.</p>
  </div>
}
