import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ColumnMapping, RawSheet } from "../lib/import"

const labels: Record<keyof ColumnMapping, string> = { keyword: "Mot-clé", intent: "Intention", volume: "Volume", kd: "KD SEO", cpc: "CPC USD" }
type SeoImportPreviewProps = {
  sheets: RawSheet[]; index: number; mapping: ColumnMapping; disabled?: boolean
  onSheet: (index: number) => void; onMapping: (mapping: ColumnMapping) => void
}

export function SeoImportPreview({ sheets, index, mapping, onSheet, onMapping, disabled = false }: SeoImportPreviewProps) {
  const sheet = sheets[index]
  return <FieldGroup className="min-w-0 gap-5">
    <Field data-disabled={disabled}><FieldLabel htmlFor="seo-sheet">Onglet à importer</FieldLabel>
      <Select value={String(index)} onValueChange={value => onSheet(Number(value))} disabled={disabled}>
        <SelectTrigger id="seo-sheet" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{sheets.map((sheet, i) => <SelectItem key={i} value={String(i)}>{sheet.name} · {sheet.rows.length} lignes</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      {(Object.keys(labels) as Array<keyof ColumnMapping>).map(key => <Field key={key} data-disabled={disabled}>
        <FieldLabel htmlFor={`seo-map-${key}`}>{labels[key]}{key === "keyword" ? " (obligatoire)" : ""}</FieldLabel>
        <Select value={String(mapping[key])} onValueChange={value => onMapping({ ...mapping, [key]: Number(value) })} disabled={disabled}>
          <SelectTrigger id={`seo-map-${key}`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="-1">Non renseigné</SelectItem>{sheet.headers.map((header, i) => <SelectItem key={i} value={String(i)}>{header || `Colonne ${i + 1}`}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select></Field>)}
    </FieldGroup>
    <FieldDescription>Associe chaque mesure à une colonne distincte. Une mesure absente reste inconnue.</FieldDescription>
    <section aria-labelledby="seo-preview-title" className="min-w-0">
    <h3 id="seo-preview-title" className="mb-2 text-sm font-medium">Aperçu des 5 premières lignes</h3>
    <div className="max-h-56 overflow-auto rounded-md border"><Table>
      <TableHeader><TableRow>{sheet.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{sheet.rows.slice(0, 5).map(r => <TableRow key={r.row}>{r.values.map((v, i) =>
        <TableCell key={i} className="max-w-52 truncate" title={v === null ? undefined : String(v)}>{v === null ? "—" : String(v)}</TableCell>)}</TableRow>)}</TableBody>
    </Table></div>
    </section>
  </FieldGroup>
}
