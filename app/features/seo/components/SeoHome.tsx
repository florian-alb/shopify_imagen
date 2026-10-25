import { useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { api } from "@/lib/convex"
import { PageHeader, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { defaultConfig, type SeoConfig } from "../types"
import { useSeoImport } from "../hooks/useSeoImport"
import { SeoConfigFields } from "./SeoConfigFields"
import { SeoFileImport } from "./SeoFileImport"
import { SeoImportPreview } from "./SeoImportPreview"
import { SeoRecentProjects } from "./SeoRecentProjects"

export function SeoHome() {
  const projects = useQuery(api.seoProjects.list)
  const create = useMutation(api.seoProjects.create)
  const navigate = useNavigate()
  const [config, setConfig] = useState<SeoConfig>(defaultConfig)
  const [submit, setSubmit] = useState({ busy: false, error: "" })
  const [accordionValue, setAccordionValue] = useState<string[]>([])
  const marketChosen = useRef(false)
  const advanced = useRef<HTMLDivElement>(null)
  const imported = useSeoImport(language => {
    if (!marketChosen.current) setConfig(current => ({ ...current, sourceLanguage: language, targetLanguage: language }))
  })
  const { file, preview } = imported
  const disabled = imported.loading || submit.busy
  const error = imported.error || imported.mappingError || submit.error

  function changeConfig(next: SeoConfig) {
    if (next.sourceLanguage !== config.sourceLanguage || next.sourceCountry !== config.sourceCountry) marketChosen.current = true
    setConfig(next)
  }
  function verifyColumns() {
    setAccordionValue(current => current.includes("advanced") ? current : [...current, "advanced"])
    requestAnimationFrame(() => {
      advanced.current?.scrollIntoView({ block: "nearest" })
      advanced.current?.focus({ preventScroll: true })
    })
  }

  return <main className={pageContentClass}>
    <PageHeader title="Arborescence SEO">Transforme tes mots-clés en collections à créer.</PageHeader>
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_15rem] 2xl:grid-cols-[minmax(0,1fr)_18rem]">
      <form className="studio-panel min-w-0 p-5 sm:p-6" onSubmit={async event => {
        event.preventDefault()
        if (!file || !preview || disabled) return
        if (!config.sourceCountry || config.sourceCountry !== config.targetCountry || config.sourceLanguage !== config.targetLanguage) {
          setSubmit({ busy: false, error: "Choisis le pays et la langue communs à l’export et à la boutique." }); return
        }
        setSubmit({ busy: true, error: "" })
        try {
          const id = await create({ config, filename: file.filename, headers: file.sheets[file.index].headers, keywords: preview.keywords })
          await navigate({ to: "/seo/$projectId", params: { projectId: id } })
        } catch (error) { setSubmit({ busy: false, error: error instanceof Error ? error.message : "Création impossible." }) }
      }}>
        <FieldGroup className="gap-6">
          <SeoFileImport filename={file?.filename} keywordCount={preview?.keywords.length} busy={imported.loading} disabled={disabled}
            onFiles={files => { setSubmit(current => ({ ...current, error: "" })); void imported.loadFiles(files) }}
            onClear={imported.clear} onVerify={verifyColumns} />
          {error && <Alert variant="destructive" role="alert"><AlertDescription>
            {error}{imported.mappingError && <Button type="button" variant="link" size="sm" className="px-0" onClick={verifyColumns}>Vérifier les colonnes</Button>}
          </AlertDescription></Alert>}
          <SeoConfigFields value={config} onChange={changeConfig} disabled={disabled} accordionValue={accordionValue} onAccordionChange={setAccordionValue}
            advancedSettings={<div ref={advanced} tabIndex={-1} className="min-w-0 scroll-mt-6" aria-label="Réglages de l’import Excel">
              {file ? <FieldGroup className="gap-5">
                <SeoImportPreview {...file} onMapping={imported.setMapping} onSheet={imported.setSheet} disabled={disabled} />
                {preview?.warnings.length ? <Alert><AlertDescription>
                  <p>{preview.warnings.length} point(s) à vérifier dans l’export.</p>
                  <ul className="flex max-h-40 list-disc flex-col gap-1 overflow-auto pl-4">{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
                </AlertDescription></Alert> : null}
              </FieldGroup> : <p className="text-sm text-muted-foreground">Ajoute un export Excel pour choisir l’onglet à importer et vérifier la correspondance des colonnes.</p>}
            </div>} />
          <div className="flex flex-col items-start gap-2">
            <Button disabled={disabled || !preview} type="submit" className="h-10 w-full sm:w-auto">
              {disabled ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}
              {submit.busy ? "Création du projet…" : "Créer le projet"}<ArrowRight data-icon="inline-end" />
            </Button>
            <p className="text-sm text-muted-foreground">L’analyse IA se lance ensuite depuis le projet.</p>
          </div>
        </FieldGroup>
      </form>
      <SeoRecentProjects projects={projects} />
    </div>
  </main>
}
