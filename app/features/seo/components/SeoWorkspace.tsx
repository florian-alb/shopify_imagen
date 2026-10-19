import { useCallback, useState } from "react"
import type { FunctionReturnType } from "convex/server"
import { Link } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { Sparkles } from "lucide-react"
import { api, type Id } from "@/lib/convex"
import { PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SeoConfigFields } from "./SeoConfigFields"
import { SeoEditor } from "./SeoEditor"
import { SeoSelect } from "./SeoSelect"
import type { SeoConfig } from "../types"

export function SeoWorkspace({ projectId }: { projectId: string }) {
  const data = useQuery(api.seoProjects.workspace, { id: projectId as Id<"seoProjects"> })
  if (!data) return <main className={pageContentClass}><Skeleton className="h-12 w-80" /><Skeleton className="mt-6 h-80 w-full" /></main>
  return <WorkspaceContent key={data.project._id} data={data} />
}
type WorkspaceData = FunctionReturnType<typeof api.seoProjects.workspace>
function WorkspaceContent({ data }: { data: WorkspaceData }) {
  const [config, setConfig] = useState<SeoConfig>(data.project.config)
  const [ui, setUi] = useState({ selectedId: null as string | null, busy: false, error: "", dirty: false })
  const { selectedId, busy, error, dirty } = ui
  const onDirtyChange = useCallback((dirty: boolean) => setUi(s => ({ ...s, dirty })), [])
  const generate = useMutation(api.seoProjects.generate)
  const selected = data.versions.find(v => v._id === selectedId) ?? data.versions[0]
  const version = useQuery(api.seoProjects.version, selected ? { id: selected._id } : "skip")
  const running = data.versions.some(v => v.status === "running")
  return <main className={pageContentClass}>
    <Link to="/seo" className="mb-4 inline-block text-sm text-muted-foreground underline underline-offset-4">Tous les projets SEO</Link>
    <PageHeader title={data.project.config.theme} eyebrow="Arborescence SEO">{data.project.filename} · {data.keywords.length} expressions · Volumes : {data.project.config.sourceCountry}</PageHeader>
    <details open={!data.versions.length} className="mb-6 rounded-lg border p-4"><summary className="cursor-pointer font-medium">Cadrage et nouvelle analyse</summary>
      <form className="mt-5 flex max-w-3xl flex-col gap-5" onSubmit={async e => {
        e.preventDefault(); if (dirty) return
        setUi(s => ({ ...s, busy: true, error: "" }))
        try { const selectedId = await generate({ id: data.project._id, config }); setUi(s => ({ ...s, selectedId })) }
        catch (e) { setUi(s => ({ ...s, error: e instanceof Error ? e.message : "Analyse impossible." })) }
        finally { setUi(s => ({ ...s, busy: false })) }
      }}><SeoConfigFields value={config} onChange={setConfig} disabled={busy || running} />
        <p className="text-sm text-muted-foreground">Chaque lancement utilise Gemini côté serveur et crée une version distincte. Enregistre les corrections de la version actuelle avant de changer de version.</p>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div><Button disabled={busy || running || dirty}><Sparkles data-icon="inline-start" />{running || busy ? "Analyse en cours…" : "Générer une nouvelle version"}</Button></div>
      </form></details>
    {data.versions.length > 0 && <div className="mb-5 max-w-lg"><SeoSelect label="Version de l’arborescence" value={version?._id ?? ""}
      options={data.versions.map((v, i) => ({ value: v._id, label: `Version ${data.versions.length - i} · ${new Date(v.createdAt).toLocaleString("fr-FR")} · ${v.status === "ready" ? "Disponible" : v.status === "failed" ? "Échec" : "En cours"}` }))}
      onChange={selectedId => {
        if (!dirty || window.confirm("Abandonner les corrections non enregistrées pour changer de version ?")) setUi(s => ({ ...s, selectedId, dirty: false }))
      }} /></div>}
    {version?.status === "running" && <Alert><AlertDescription>Analyse des mots-clés et des sources en cours. Tu peux quitter cette page et revenir : le travail continue côté serveur.</AlertDescription></Alert>}
    {version?.status === "failed" && <Alert variant="destructive"><AlertDescription>{version.error || "L’analyse a échoué."} Les données importées et les versions précédentes sont conservées.</AlertDescription></Alert>}
    {version?.status === "ready" && version.workingJson && <SeoEditor key={version._id} version={version} keywords={data.keywords} headers={data.project.headers} filename={data.project.filename} onDirtyChange={onDirtyChange} />}
    {selected && !version && <Skeleton className="h-64 w-full" />}
    {!selected && <p className="py-8 text-sm text-muted-foreground">Le fichier est importé. Vérifie le cadrage puis lance ta première analyse.</p>}
  </main>
}
