import { normalizeKeyword, slugify, type Keyword, type SeoDocument, type SourceObservation } from "./model"
import { parseDocument } from "./validation"

/** Repair references, then keep v2 collections supported by imported keyword decisions. */
export function reconcileGenerated(value: unknown, keywords: Keyword[], sources: SourceObservation[], analysisVersion?: 2): SeoDocument {
  if (!value || typeof value !== "object" || !("nodes" in value) || !("assignments" in value)
    || !Array.isArray(value.nodes) || !Array.isArray(value.assignments)) throw new Error("Structure d’analyse invalide.")
  const warnings: string[] = []
  let nodes = value.nodes.filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === "object").map(node => ({ ...node }))
  const rawIds = nodes.map(n => n.id)
  const idsByRaw = new Map<unknown, string[]>()
  nodes.forEach((n, i) => {
    const id = `page-${i + 1}`
    idsByRaw.set(n.id, [...(idsByRaw.get(n.id) ?? []), id])
    n.id = id
  })
  const resolveId = (raw: unknown) => { const ids = idsByRaw.get(raw); return ids?.length === 1 ? ids[0] : null }
  nodes.forEach(n => {
    if (n.parentId !== null) {
      const parent = resolveId(n.parentId)
      if (!parent) warnings.push(`${String(n.id)} : parent IA ambigu ou absent, page placée à la racine.`)
      n.parentId = parent
    }
  })
  if (new Set(rawIds).size !== rawIds.length) warnings.push("Identifiants IA dupliqués : identifiants uniques reconstruits ; les affectations ambiguës restent à vérifier.")
  const knownNodes = new Set(nodes.map(n => n.id))
  const knownSources = new Set(sources.filter(s => !s.error).map(s => s.id))
  const rawAssignments = value.assignments.filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
  const knownKeys = new Set(keywords.map(keyword => keyword.key))
  if (analysisVersion === 2 && rawAssignments.some(assignment => !knownKeys.has(String(assignment.key))))
    warnings.push("Des expressions absentes de l’Excel ont été écartées ; seules les lignes importées peuvent alimenter le menu.")
  const byKey = new Map<string, Record<string, unknown>[]>()
  for (const assignment of rawAssignments) {
    if (typeof assignment.key === "string") byKey.set(assignment.key, [...(byKey.get(assignment.key) ?? []), assignment])
  }
  const assignments = keywords.map(keyword => {
    const matches = byKey.get(keyword.key) ?? []
    if (matches.length !== 1) {
      warnings.push(`${keyword.key} : affectation IA ${matches.length ? "dupliquée" : "absente"}, à vérifier.`)
      return { key: keyword.key, nodeId: null, relevance: "review", inferredIntent: "unknown", reason: "Affectation IA absente ou contradictoire ; vérifier cette expression." }
    }
    const a = { ...matches[0] }
    if (a.nodeId !== null) a.nodeId = resolveId(a.nodeId)
    if (a.relevance === "excluded") a.nodeId = null
    else if (a.nodeId !== null && !knownNodes.has(a.nodeId) || a.relevance === "relevant" && a.nodeId === null) {
      warnings.push(`${keyword.key} : référence IA incohérente, à vérifier.`)
      a.nodeId = null; a.relevance = "review"
      a.reason = `${typeof a.reason === "string" ? a.reason : ""} Page IA non résolue ; vérifier l’affectation.`.trim().slice(0, 2000)
    }
    return a
  })
  // A duplicate source expression cannot create conflicting page targets.
  const duplicates = new Map<string, Record<string, unknown>[]>()
  keywords.forEach((k, i) => duplicates.set(normalizeKeyword(k.keyword), [...(duplicates.get(normalizeKeyword(k.keyword)) ?? []), assignments[i]]))
  for (const group of duplicates.values()) if (group.length > 1 && new Set(group.map(a => a.nodeId)).size > 1) {
    for (const a of group) { a.nodeId = null; a.relevance = "review"; a.reason = "Doublon exact affecté à plusieurs pages par l’IA ; vérifier le regroupement." }
    warnings.push("Des doublons exacts possèdent des affectations IA contradictoires et restent à vérifier.")
  }
  for (const node of nodes) {
    const own = assignments.filter(a => a.nodeId === node.id && (analysisVersion === 2 ? a.relevance === "relevant" : a.relevance !== "excluded"))
    if (node.primaryKey !== null && !own.some(a => a.key === node.primaryKey)) {
      warnings.push(`${String(node.id)} : mot-clé principal recalculé à partir des affectations.`)
      node.primaryKey = null
    }
    if (node.primaryKey === null && own.length) {
      const keys = new Set(own.map(a => a.key))
      node.primaryKey = [...keywords].filter(k => keys.has(k.key)).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.row - b.row)[0].key
    }
    if (Array.isArray(node.sourceIds)) {
      const ids = node.sourceIds.filter(id => knownSources.has(id))
      if (ids.length !== node.sourceIds.length) warnings.push(`${String(node.id)} : source IA non consultée retirée.`)
      node.sourceIds = ids
    }
    node.origin = own.length ? "keywords" : Array.isArray(node.sourceIds) && node.sourceIds.length ? "competitor" : "ai"
    node.status = "pending"; node.priorityOverride = null
  }
  const opportunities: Record<string, unknown>[] = []
  if (analysisVersion === 2) {
    const rawOpportunities = "opportunities" in value && Array.isArray(value.opportunities) ? value.opportunities : []
    const addOpportunity = (opportunity: Record<string, unknown>) => {
      const sourceIds = Array.isArray(opportunity.sourceIds) ? opportunity.sourceIds.filter(id => knownSources.has(id)) : []
      if (!sourceIds.length) {
        warnings.push(`${String(opportunity.title)} : proposition hors export sans source vérifiée écartée.`)
        return
      }
      opportunities.push({ ...opportunity, id: `opportunity-${opportunities.length + 1}`, sourceIds })
    }
    for (const opportunity of rawOpportunities) {
      if (!opportunity || typeof opportunity !== "object" || Array.isArray(opportunity)) throw new Error("Opportunité d’analyse invalide.")
      addOpportunity(opportunity as Record<string, unknown>)
    }
    // Groups organize supported collections; they never inherit demand from descendants.
    for (const node of nodes.filter(node => node.kind === "group")) {
      node.primaryKey = null
      for (const assignment of assignments.filter(assignment => assignment.nodeId === node.id)) {
        assignment.nodeId = null; assignment.relevance = "review"
        assignment.reason = "Un regroupement de navigation ne représente pas une collection ; affectation à vérifier."
      }
      node.origin = Array.isArray(node.sourceIds) && node.sourceIds.length ? "competitor" : "ai"
    }
    const supported = new Set(nodes.filter(node => node.kind === "collection" && assignments.some(assignment => assignment.nodeId === node.id && assignment.relevance === "relevant")).map(node => node.id))
    const retained = new Set(supported)
    for (const node of nodes.filter(node => supported.has(node.id))) {
      const visited = new Set([node.id])
      let parent = node.parentId
      while (parent !== null && !visited.has(parent)) {
        const ancestor = nodes.find(candidate => candidate.id === parent)
        if (!ancestor) break
        retained.add(ancestor.id); visited.add(parent); parent = ancestor.parentId
      }
    }
    for (const node of nodes.filter(node => node.kind === "collection" && !supported.has(node.id))) {
      addOpportunity({ title: node.title, rationale: node.rationale, products: node.products, sourceIds: node.sourceIds })
      for (const assignment of assignments.filter(assignment => assignment.nodeId === node.id)) {
        assignment.nodeId = null; assignment.relevance = "review"
        assignment.reason = `${typeof assignment.reason === "string" ? assignment.reason : ""} Collection sans affectation pertinente dans l’Excel ; vérifier cette expression.`.trim().slice(0, 2000)
      }
      if (retained.has(node.id)) {
        node.kind = "group"; node.primaryKey = null
        node.origin = Array.isArray(node.sourceIds) && node.sourceIds.length ? "competitor" : "ai"
        warnings.push(`${String(node.title)} : conservé comme simple regroupement, sans mot-clé ni volume.`)
      } else warnings.push(`${String(node.title)} : collection sans mot-clé pertinent retirée du menu.`)
    }
    // Invalid page kinds stay visible to the validator instead of being converted into collections.
    nodes = nodes.filter(node => node.kind !== "group" && node.kind !== "collection" || retained.has(node.id))
    const slugs = new Set<string>()
    for (const node of nodes) {
      const base = slugify(typeof node.slug === "string" ? node.slug : String(node.title)) || String(node.id)
      let slug = base, suffix = 2
      while (slugs.has(slug)) slug = `${base}-${suffix++}`
      slugs.add(slug); node.slug = slug
    }
  }
  // Flatten mechanical hierarchy defects without inventing keyword assignments.
  for (const node of nodes) {
    const visited = new Set([node.id])
    let parent = node.parentId, depth = node.kind === "collection" ? 1 : 0, menuDepth = 1
    while (parent !== null) {
      const ancestor = nodes.find(n => n.id === parent)
      if (!ancestor || visited.has(parent) || ancestor.kind === "collection" && ++depth > 2 || analysisVersion === 2 && ++menuDepth > 3) {
        node.parentId = null
        warnings.push(`${String(node.id)} : hiérarchie IA aplatie (cycle, parent manquant ou profondeur excessive).`)
        break
      }
      visited.add(parent); parent = ancestor.parentId
    }
  }
  if (analysisVersion === 2) {
    let removed: boolean
    do {
      const emptyGroups = new Set(nodes.filter(node => node.kind === "group" && !nodes.some(child => child.parentId === node.id)).map(node => node.id))
      removed = emptyGroups.size > 0
      nodes = nodes.filter(node => !emptyGroups.has(node.id))
    } while (removed)
  }
  const baseWarnings = "warnings" in value && Array.isArray(value.warnings) ? value.warnings : []
  return parseDocument({ nodes, assignments, opportunities, warnings: [...new Set([...baseWarnings, ...warnings])].slice(0, 30) }, keywords, sources, { analysisVersion })
}
