import { Copy, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { buildPolicyPreview, type GeneratedPolicy, type PolicyId } from "../lib/generate"

type PolicyPreviewProps = {
  policies: GeneratedPolicy[]
  selected: GeneratedPolicy
  activePolicy: PolicyId
  storeName: string
  onSelect: (id: PolicyId) => void
  onCopy: () => void
  onDownload: () => void
}

export function PolicyPreview({ policies, selected, activePolicy, storeName, onSelect, onCopy, onDownload }: PolicyPreviewProps) {
  const title = selected.title
  return (
    <section aria-label="Documents générés" className="min-w-0 space-y-4 lg:sticky lg:top-20">
      <nav aria-label="Choisir une politique" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {policies.map((policy) => (
          <Button key={policy.id} variant="outline" className={cn("h-auto min-h-11 whitespace-normal py-2 text-left text-xs", activePolicy === policy.id && "border-primary bg-primary/5 text-primary")} aria-pressed={activePolicy === policy.id} onClick={() => onSelect(policy.id)}>
            {policy.title}
          </Button>
        ))}
      </nav>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onDownload}><Download />Télécharger</Button>
            <Button size="sm" onClick={onCopy}><Copy />Copier le HTML</Button>
          </div>
        </div>
        <Tabs defaultValue="preview" className="gap-0">
          <div className="border-b px-4 py-2"><TabsList><TabsTrigger value="preview">Aperçu</TabsTrigger><TabsTrigger value="html">HTML</TabsTrigger></TabsList></div>
          <TabsContent value="preview" className="m-0">
            <iframe key={selected.id} title={`Aperçu — ${selected.title}`} sandbox="" referrerPolicy="no-referrer" srcDoc={buildPolicyPreview(selected, storeName)} className="block h-[65dvh] min-h-96 w-full bg-white" />
          </TabsContent>
          <TabsContent value="html" className="m-0 p-3">
            <Textarea aria-label={`Code HTML — ${selected.title}`} readOnly value={selected.html} spellCheck={false} className="h-[65dvh] min-h-96 resize-none font-mono text-xs" />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
