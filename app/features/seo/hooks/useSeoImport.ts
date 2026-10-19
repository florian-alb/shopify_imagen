import { useState } from "react"
import { readWorkbook } from "../lib/excel"
import { detectMapping, prepareKeywords, suggestLanguage, type ColumnMapping, type RawSheet } from "../lib/import"

type ImportState = { sheets: RawSheet[]; index: number; mapping: ColumnMapping; filename: string }

export function useSeoImport(onLanguageSuggested: (language: string) => void) {
  const [file, setFile] = useState<ImportState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  let preview: ReturnType<typeof prepareKeywords> | null = null
  let mappingError = ""
  if (file) {
    try { preview = prepareKeywords(file.sheets[file.index], file.mapping) }
    catch (error) { mappingError = error instanceof Error ? error.message : "Import invalide." }
  }

  async function loadFiles(files: File[]) {
    if (!files.length || loading) return
    if (files.length !== 1) { setError("Sélectionne un seul fichier Excel à la fois."); return }
    const selected = files[0]
    if (!/\.xlsx$/i.test(selected.name)) { setError("Ce format n’est pas pris en charge. Choisis un fichier .xlsx."); return }
    setLoading(true); setError("")
    try {
      const sheets = await readWorkbook(selected)
      if (!sheets.length) throw new Error("Ce classeur est vide.")
      const mapping = detectMapping(sheets[0].headers)
      setFile({ sheets, index: 0, mapping, filename: selected.name })
      // A mapping error is recoverable in Advanced settings; retain the workbook.
      try {
        const language = suggestLanguage(prepareKeywords(sheets[0], mapping).keywords)
        if (language) onLanguageSuggested(language)
      } catch { /* The mapping error is displayed alongside the import. */ }
    } catch (error) { setError(error instanceof Error ? error.message : "Lecture Excel impossible.") }
    finally { setLoading(false) }
  }

  return {
    file, preview, loading, error, mappingError, loadFiles,
    clear: () => { setFile(null); setError("") },
    setMapping: (mapping: ColumnMapping) => setFile(current => current && ({ ...current, mapping })),
    setSheet: (index: number) => setFile(current => current && ({ ...current, index, mapping: detectMapping(current.sheets[index].headers) })),
  }
}
