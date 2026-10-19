import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Download, Save } from "lucide-react"
import type { Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Keyword } from "../types"
import { useSeoEditor } from "../hooks/useSeoEditor"
import { buildExcel, downloadBlob } from "../lib/excel"
import { SeoNodeInspector } from "./SeoNodeInspector"
import { SeoTree } from "./SeoTree"
import { SeoKeywordTable } from "./SeoKeywordTable"
import { SeoOpportunities } from "./SeoOpportunities"
import { SeoSources } from "./SeoSources"

export function SeoEditor({ version, keywords, headers, filename, onDirtyChange }: { version: Doc<"seoVersions">; keywords: Keyword[]; headers: string[]; filename: string; onDirtyChange: (dirty: boolean) => void }) {
  const editor = useSeoEditor(version, keywords)
  const [selectedId, setSelectedId] = useState<string | null>(editor.document.nodes[0]?.id ?? null)
  const [exporting, setExporting] = useState(false)
  const collectionMenu = editor.document.analysisVersion === 2
  useEffect(() => { onDirtyChange(editor.dirty) }, [editor.dirty, onDirtyChange])
  const selected = editor.document.nodes.find(n => n.id === selectedId)
  async function exportFile(kind: "xlsx" | "json") {
    setExporting(true)
    try {
      if (kind === "json") downloadBlob(JSON.stringify({ schemaVersion: collectionMenu ? 2 : 1, versionId: version._id, revision: editor.revision, filename,
        headers, config: version.config, model: version.model, keywords, ...editor.document }, null, 2), "arborescence-seo.json", "application/json")
      else {
        const buffer = await buildExcel(editor.document, keywords, version.config, headers)
        downloadBlob(new Uint8Array(buffer), "arborescence-seo.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible.") }
    finally { setExporting(false) }
  }
  return <section className="flex flex-col gap-5" aria-label="Éditeur d’arborescence">
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
      <p className="text-sm" role="status">{collectionMenu ? `${editor.document.nodes.filter(n => n.kind === "collection").length} collections` : `${editor.document.nodes.length} pages`} · {keywords.length} expressions · {editor.dirty ? "Corrections non enregistrées" : "Version enregistrée"}</p>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void editor.save()} disabled={!editor.dirty || editor.busy} size="sm"><Save data-icon="inline-start" />{editor.busy ? "Enregistrement…" : "Enregistrer"}</Button>
        <Button variant="outline" size="sm" disabled={editor.dirty || exporting || editor.busy} onClick={() => void exportFile("xlsx")}><Download data-icon="inline-start" />Excel</Button>
        <Button variant="outline" size="sm" disabled={editor.dirty || exporting || editor.busy} onClick={() => void exportFile("json")}>JSON</Button></div>
    </div>
    {editor.dirty && <p className="text-sm text-muted-foreground">Enregistre tes corrections pour pouvoir les exporter. Elles restent locales tant que tu n’as pas enregistré.</p>}
    {version.revision !== editor.revision && <Alert><AlertDescription>Une autre session a modifié cette version. <Button variant="link" onClick={() => {
      if (!editor.dirty || window.confirm("Abandonner les corrections locales et charger la version enregistrée ?")) editor.reload()
    }}>Recharger la version enregistrée</Button></AlertDescription></Alert>}
    {editor.error && <Alert variant="destructive"><AlertDescription>{editor.error}</AlertDescription></Alert>}
    {!collectionMenu && <Alert><AlertDescription>Analyse historique : cette version peut contenir des articles et des hypothèses sans mot-clé mesuré. Ses priorités utilisent l’ancienne méthode avec intention et KD. Lance une nouvelle version pour obtenir un menu de collections fondé sur l’Excel.</AlertDescription></Alert>}
    <Tabs defaultValue="tree" className="min-w-0"><div className="max-w-full overflow-x-auto"><TabsList aria-label="Vue de l’analyse"><TabsTrigger value="tree">{collectionMenu ? "Menu des collections" : "Arborescence historique"}</TabsTrigger>
      {collectionMenu && <TabsTrigger value="opportunities">Opportunités hors Excel · {editor.document.opportunities?.length ?? 0}</TabsTrigger>}
      <TabsTrigger value="keywords">Mots-clés et exclusions</TabsTrigger><TabsTrigger value="sources">Sources et limites</TabsTrigger></TabsList></div>
      <TabsContent value="tree"><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <SeoTree document={editor.document} keywords={keywords} config={version.config} selectedId={selectedId} onSelect={setSelectedId} />
        {selected ? <SeoNodeInspector key={selected.id} node={selected} document={editor.document} keywords={keywords}
          onChange={changes => editor.changeNode(selected.id, changes)} onMerge={target => { if (editor.merge(selected.id, target)) setSelectedId(target) }} /> : <p className="text-sm text-muted-foreground">{collectionMenu ? "Sélectionne une collection ou un regroupement pour le modifier." : "Sélectionne une page pour la modifier."}</p>}
      </div></TabsContent>
      {collectionMenu && <TabsContent value="opportunities"><SeoOpportunities document={editor.document} /></TabsContent>}
      <TabsContent value="keywords"><SeoKeywordTable document={editor.document} keywords={keywords} onChange={editor.assign} /></TabsContent>
      <TabsContent value="sources"><SeoSources document={editor.document} model={version.model} /></TabsContent>
    </Tabs>
  </section>
}
