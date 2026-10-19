import { useRef, useState } from "react"
import { ChevronRight, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type SeoFileImportProps = {
  filename?: string
  keywordCount?: number
  busy: boolean
  disabled: boolean
  onFiles: (files: File[]) => void
  onClear: () => void
  onVerify: () => void
}

export function SeoFileImport({ filename, keywordCount, busy, disabled, onFiles, onClear, onVerify }: SeoFileImportProps) {
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const Icon = busy ? LoaderCircle : filename ? FileSpreadsheet : Upload

  return <Field data-disabled={disabled}>
    <FieldLabel htmlFor="seo-file">Export Semrush</FieldLabel>
    <Input ref={input} id="seo-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="sr-only" tabIndex={-1} disabled={disabled} aria-describedby="seo-file-help"
      onChange={event => {
        onFiles(Array.from(event.target.files ?? []))
        event.target.value = ""
      }} />
    <div className={cn("relative rounded-lg border border-dashed px-4 transition-colors sm:px-5", dragging && !disabled && "border-primary bg-primary/5")}
      onDragEnter={event => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return
        event.preventDefault(); dragDepth.current++; setDragging(true)
      }}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
      onDragLeave={event => {
        event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault(); dragDepth.current = 0; setDragging(false)
        if (!disabled) onFiles(Array.from(event.dataTransfer.files))
      }}>
      <Button type="button" variant="ghost" className="absolute inset-0 size-full cursor-pointer" disabled={disabled}
        aria-label={filename ? "Changer le fichier Excel" : "Choisir un fichier"} aria-describedby="seo-file-help" onClick={() => input.current?.click()} />
      <div className="pointer-events-none relative flex flex-wrap items-center gap-4 py-5">
        <Icon aria-hidden="true" className={cn("size-8 shrink-0 text-muted-foreground", busy && "animate-spin")} />
        <div className="min-w-0 flex-1 basis-40" role="status" aria-live="polite">
          <p className="truncate text-sm font-medium" title={filename}>{busy ? "Lecture du fichier…" : filename || "Dépose ton export Excel ici"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{keywordCount !== undefined ? `${keywordCount} mots-clés détectés` : filename ? "Vérifie les colonnes pour terminer l’import." : "ou sélectionne un fichier sur ton ordinateur"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span aria-hidden="true" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {filename ? "Changer" : "Choisir un fichier"}
          </span>
          {filename && <Button type="button" variant="ghost" size="icon" className="pointer-events-auto" disabled={disabled} aria-label="Retirer le fichier Excel" onClick={onClear}><X /></Button>}
        </div>
      </div>
      {filename && <><Separator /><Button type="button" variant="ghost" className="relative h-10 w-full justify-between px-0" disabled={disabled} onClick={onVerify}>
        Vérifier les colonnes<ChevronRight data-icon="inline-end" />
      </Button></>}
    </div>
    <FieldDescription id="seo-file-help">Format .xlsx · 5 Mo maximum · jusqu’à 300 mots-clés. Les données originales sont conservées.</FieldDescription>
  </Field>
}
