import { useState } from "react"
import { useBlocker } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { api, type Doc } from "@/lib/convex"
import { parseDocument, validateDocument } from "../../../../convex/seo/validation"
import type { Assignment, Keyword, SeoDocument, SeoNode } from "../types"
import { assignKeyword, mergeNodes } from "../lib/editor"

export function useSeoEditor(version: Doc<"seoVersions">, keywords: Keyword[]) {
  const saveMutation = useMutation(api.seoProjects.save)
  const [state, setState] = useState(() => ({ document: JSON.parse(version.workingJson!) as SeoDocument,
    revision: version.revision, savedJson: version.workingJson!, busy: false, error: "" }))
  const json = JSON.stringify(state.document), dirty = json !== state.savedJson
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("Quitter cette page et abandonner les corrections non enregistrées ?"), enableBeforeUnload: dirty })
  function update(document: SeoDocument) { setState(s => ({ ...s, document, error: "" })) }
  function changeNode(id: string, changes: Partial<SeoNode>) {
    const next = { ...state.document, nodes: state.document.nodes.map(n => n.id === id ? { ...n, ...changes } : n) }
    if ("parentId" in changes) try { validateDocument(next, keywords) } catch (e) { setState(s => ({ ...s, error: e instanceof Error ? e.message : "Parent invalide." })); return }
    update(next)
  }
  function merge(source: string, target: string) {
    try { const next = mergeNodes(state.document, source, target); validateDocument(next, keywords); update(next); return true }
    catch (e) { setState(s => ({ ...s, error: e instanceof Error ? e.message : "Fusion impossible." })); return false }
  }
  async function save() {
    setState(s => ({ ...s, busy: true, error: "" }))
    try {
      const document = parseDocument(state.document, keywords, state.document.sources, { analysisVersion: version.analysisVersion })
      const savedJson = JSON.stringify(document)
      const revision = await saveMutation({ versionId: version._id, revision: state.revision, documentJson: savedJson })
      setState(s => ({ ...s, document, savedJson, revision, busy: false }))
    } catch (e) { setState(s => ({ ...s, busy: false, error: e instanceof Error ? e.message : "Enregistrement impossible." })) }
  }
  return { ...state, dirty, save, changeNode, merge,
    assign: (key: string, changes: Partial<Assignment>) => {
      try { update(assignKeyword(state.document, key, changes)) }
      catch (e) { setState(s => ({ ...s, error: e instanceof Error ? e.message : "Affectation impossible." })) }
    },
    reload: () => setState({ document: JSON.parse(version.workingJson!), revision: version.revision, savedJson: version.workingJson!, busy: false, error: "" }),
  }
}
