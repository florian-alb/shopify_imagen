import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import type { Keyword, SeoDocument, SeoNode } from "../types"
import { intents, intentLabels, kindLabels, originLabels, pageKinds, statusLabels } from "../types"
import { SeoSelect } from "./SeoSelect"

export function SeoNodeInspector({ node, document, keywords, onChange, onMerge }: {
  node: SeoNode; document: SeoDocument; keywords: Keyword[]; onChange: (changes: Partial<SeoNode>) => void; onMerge: (target: string) => void
}) {
  const [target, setTarget] = useState("")
  const collectionMenu = document.analysisVersion === 2
  const group = collectionMenu && node.kind === "group"
  const attached = document.assignments.filter(a => a.nodeId === node.id)
  const kinds = collectionMenu ? pageKinds.filter(k => k === "collection" || k === "group") : pageKinds.filter(k => k !== "group")
  const measured = collectionMenu ? attached.filter(a => a.relevance === "relevant") : attached
  const destinations = document.nodes.filter(n => n.id !== node.id && (!collectionMenu || group || n.kind === "collection"))
  return <section className="studio-inspector flex min-w-0 flex-col gap-5 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto" aria-label="Détail de la page">
    <div><h2 className="font-semibold">{collectionMenu ? "Détail de l’entrée de menu" : "Détail de la page"}</h2><p className="mt-1 text-xs text-muted-foreground">{originLabels[node.origin]}</p></div>
    <FieldGroup>
      <Field><FieldLabel htmlFor="seo-node-title">{collectionMenu ? "Nom dans le menu" : "Nom de la page"}</FieldLabel><Input id="seo-node-title" value={node.title} onChange={e => onChange({ title: e.target.value })} maxLength={200} /></Field>
      {!group && <Field><FieldLabel htmlFor="seo-node-slug">Slug</FieldLabel><Input id="seo-node-slug" value={node.slug} onChange={e => onChange({ slug: e.target.value })} maxLength={200} /></Field>}
      <SeoSelect label={collectionMenu ? "Type d’entrée" : "Type de page"} value={node.kind} options={kinds.map(k => ({ value: k, label: kindLabels[k], disabled: k === "group" && attached.length > 0 }))}
        onChange={kind => onChange({ kind: kind as SeoNode["kind"], ...(kind === "group" ? { primaryKey: null, priorityOverride: null } : {}) })} />
      {collectionMenu && <p className="text-xs text-muted-foreground">Une collection doit avoir un mot-clé principal réel de l’Excel. Un regroupement organise le menu sans créer de collection : déplace ses mots-clés avant de choisir ce type.</p>}
      <SeoSelect label="Parent" value={node.parentId ?? ""} options={[{ value: "", label: "Racine" }, ...document.nodes.filter(n => n.id !== node.id).map(n => ({ value: n.id, label: n.title }))]}
        onChange={parentId => onChange({ parentId: parentId || null })} />
      {!group && <SeoSelect label="Mot-clé principal" value={node.primaryKey ?? ""} options={[{ value: "", label: collectionMenu ? "Choisir un mot-clé de l’Excel" : "Sans mot-clé mesuré" }, ...measured.map(a => ({ value: a.key, label: keywords.find(k => k.key === a.key)?.keyword ?? a.key }))]}
        onChange={primaryKey => onChange({ primaryKey: primaryKey || null })} />}
      {!group && <SeoSelect label={collectionMenu ? "Intention indicative" : "Intention interprétée"} value={node.intent} options={intents.map(i => ({ value: i, label: intentLabels[i] }))} onChange={intent => onChange({ intent: intent as SeoNode["intent"] })} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {!group && <SeoSelect label="Priorité" value={node.priorityOverride ?? ""} options={[{ value: "", label: collectionMenu ? "Automatique selon le volume" : "Automatique" }, ...["P1", "P2", "P3"].map(v => ({ value: v, label: v }))]}
          onChange={priority => onChange({ priorityOverride: priority ? priority as "P1" | "P2" | "P3" : null })} />}
        <SeoSelect label="Validation" value={node.status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          onChange={status => onChange({ status: status as SeoNode["status"] })} />
      </div>
      <Field><FieldLabel htmlFor="seo-node-reason">Justification</FieldLabel><Textarea id="seo-node-reason" value={node.rationale} onChange={e => onChange({ rationale: e.target.value })} maxLength={2000} /></Field>
    </FieldGroup>
    {!group && <div className="text-sm"><h3 className="font-medium">Produits à sourcer</h3><p className="mt-1 text-muted-foreground">{node.products.join(", ") || "À préciser"}</p></div>}
    {node.sourceIds.length > 0 && <div className="text-sm"><h3 className="font-medium">Sources consultées</h3><ul className="mt-1 flex flex-col gap-2">{node.sourceIds.map(id => {
      const source = document.sources.find(s => s.id === id)
      return source ? <li key={id}><a href={source.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{source.title || source.url}</a></li> : null
    })}</ul></div>}
    <div className="flex flex-col gap-3 border-t pt-4">
      <SeoSelect label={collectionMenu ? "Fusionner dans une autre entrée" : "Fusionner dans une autre page"} value={target} options={[{ value: "", label: "Choisir une destination" }, ...destinations.map(n => ({ value: n.id, label: n.title }))]} onChange={setTarget} />
      <Button variant="outline" disabled={!target} onClick={() => { onMerge(target); setTarget("") }}>Fusionner les regroupements</Button>
    </div>
  </section>
}
