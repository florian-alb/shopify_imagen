import { MAX_DOCUMENT_BYTES, intents, pageKinds, relevanceKinds, type Keyword, type SeoDocument, type SeoNode, type SeoOpportunity, type SourceObservation } from "./model"

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Objet d’analyse invalide.")
  return value as Record<string, unknown>
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Texte d’analyse invalide ou trop long.")
  return value
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error(`Valeur d’analyse invalide : ${String(value).slice(0, 80)}.`)
  return value as T
}
function strings(value: unknown, max = 40): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Liste d’analyse invalide.")
  return value.map(x => text(x, 500))
}

/** The model never owns imported metrics, observations, or source provenance. */
export function parseDocument(value: unknown, keywords: Keyword[], sources: SourceObservation[], context?: { analysisVersion?: 2 }): SeoDocument {
  const obj = record(value)
  const analysisVersion = context ? context.analysisVersion : obj.analysisVersion
  if (analysisVersion !== undefined && analysisVersion !== 2) throw new Error("Version d’analyse inconnue.")
  if (!Array.isArray(obj.nodes) || obj.nodes.length > 35 || !Array.isArray(obj.assignments)) throw new Error("Structure d’analyse invalide (35 pages maximum).")
  const nodes: SeoNode[] = obj.nodes.map((value): SeoNode => {
    const n = record(value)
    return { id: text(n.id, 80), parentId: n.parentId === null ? null : text(n.parentId, 80),
      title: text(n.title, 200), slug: text(n.slug, 200), kind: choice(n.kind, pageKinds),
      primaryKey: n.primaryKey === null ? null : text(n.primaryKey, 80), intent: choice(n.intent, intents),
      rationale: text(n.rationale), products: strings(n.products), sourceIds: strings(n.sourceIds, 12),
      origin: choice(n.origin, ["keywords", "competitor", "ai"]),
      status: n.status === undefined ? "pending" : choice(n.status, ["pending", "accepted", "rejected"]),
      priorityOverride: n.priorityOverride == null ? null : choice(n.priorityOverride, ["P1", "P2", "P3"] as const) }
  })
  const assignments = obj.assignments.map(value => {
    const a = record(value)
    return { key: text(a.key, 80), nodeId: a.nodeId === null ? null : text(a.nodeId, 80),
      relevance: choice(a.relevance, relevanceKinds), inferredIntent: choice(a.inferredIntent, intents), reason: text(a.reason) }
  })
  if (obj.opportunities !== undefined && (!Array.isArray(obj.opportunities) || obj.opportunities.length > 50))
    throw new Error("Liste d’opportunités invalide (50 maximum).")
  const opportunities: SeoOpportunity[] = ((obj.opportunities as unknown[] | undefined) ?? []).map(value => {
    const opportunity = record(value)
    return { id: text(opportunity.id, 80), title: text(opportunity.title, 200), rationale: text(opportunity.rationale),
      products: strings(opportunity.products), sourceIds: strings(opportunity.sourceIds, 12) }
  })
  const document: SeoDocument = { nodes, assignments, sources, warnings: strings(obj.warnings ?? [], 30),
    ...(analysisVersion === 2 ? { analysisVersion, opportunities } : {}) }
  validateDocument(document, keywords)
  return document
}

export function validateDocument(document: SeoDocument, keywords: Keyword[]) {
  if (document.analysisVersion !== undefined && document.analysisVersion !== 2) throw new Error("Version d’analyse inconnue.")
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_DOCUMENT_BYTES) throw new Error("Analyse trop volumineuse pour ce POC.")
  const ids = new Set(document.nodes.map(n => n.id)), keys = new Set(keywords.map(k => k.key))
  if (ids.size !== document.nodes.length) throw new Error("Les identifiants de nodes doivent être uniques.")
  for (const n of document.nodes) {
    if (!n.id || !n.title.trim()) throw new Error("Chaque node doit avoir un id et un titre non vide.")
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(n.slug)) throw new Error(`${n.id} : slug invalide, utiliser des lettres ASCII, chiffres et tirets.`)
  }
  if (new Set(document.nodes.map(n => n.slug)).size !== document.nodes.length) throw new Error("Deux pages ont le même slug.")
  if (document.assignments.length !== keywords.length || new Set(document.assignments.map(a => a.key)).size !== keys.size)
    throw new Error("Chaque ligne source doit avoir exactement une affectation.")
  for (const a of document.assignments) {
    if (!keys.has(a.key)) throw new Error(`Ligne source inconnue : ${a.key}.`)
    if (a.nodeId !== null && !ids.has(a.nodeId)) throw new Error(`${a.key} : la page ${a.nodeId} n’existe pas dans nodes.`)
    if (!a.reason.trim()) throw new Error(`${a.key} : une raison est obligatoire.`)
    if (a.relevance === "relevant" && a.nodeId === null) throw new Error(`${a.key} : relevant exige un nodeId existant ; sinon utiliser review.`)
    if (a.relevance === "excluded" && a.nodeId !== null) throw new Error(`${a.key} : excluded exige nodeId:null.`)
  }
  const sourceIds = new Set(document.sources.filter(s => !s.error).map(s => s.id))
  if ((document.opportunities?.length ?? 0) > 50) throw new Error("Liste d’opportunités invalide (50 maximum).")
  const opportunityIds = new Set<string>()
  for (const opportunity of document.opportunities ?? []) {
    if (!opportunity.id || !opportunity.title.trim() || !opportunity.rationale.trim() || opportunityIds.has(opportunity.id))
      throw new Error("Chaque opportunité exige un identifiant unique, un titre et une justification.")
    opportunityIds.add(opportunity.id)
    if (!opportunity.sourceIds.length || opportunity.sourceIds.some(id => !sourceIds.has(id)))
      throw new Error("Une opportunité hors export doit citer une source concurrente vérifiée.")
  }
  for (const node of document.nodes) {
    if (node.sourceIds.some(id => !sourceIds.has(id))) throw new Error("Source concurrente non vérifiée.")
    if (node.origin === "competitor" && !node.sourceIds.length) throw new Error("La proposition concurrente doit citer une source consultée.")
    const own = document.assignments.filter(a => a.nodeId === node.id && a.relevance !== "excluded")
    if (document.analysisVersion === 2) {
      if (node.kind !== "collection" && node.kind !== "group") throw new Error("Le menu marchand contient uniquement des collections et des groupes.")
      if (node.kind === "group") {
        if (node.primaryKey !== null || own.length) throw new Error("Un groupe de navigation ne possède ni mot-clé principal ni affectation.")
        if (!document.nodes.some(child => child.parentId === node.id)) throw new Error("Un groupe de navigation doit organiser des collections.")
      } else {
        const relevant = own.filter(a => a.relevance === "relevant")
        if (!relevant.length || node.primaryKey === null || !relevant.some(a => a.key === node.primaryKey))
          throw new Error("Chaque collection exige un mot-clé principal de l’Excel affecté comme pertinent.")
      }
    }
    if (node.primaryKey !== null && !own.some(a => a.key === node.primaryKey) || node.origin === "keywords" && !own.length)
      throw new Error("Mot-clé principal sans affectation correspondante.")
    const visited = new Set([node.id])
    let parent = node.parentId, collectionDepth = node.kind === "collection" ? 1 : 0, menuDepth = 1
    while (parent !== null) {
      const next = document.nodes.find(n => n.id === parent)
      if (!next || visited.has(parent)) throw new Error("Parent manquant ou cycle dans l’arborescence.")
      visited.add(parent)
      if (document.analysisVersion === 2 && ++menuDepth > 3) throw new Error("Trois niveaux de menu au maximum.")
      if (next.kind === "collection") collectionDepth++
      if (collectionDepth > 2) throw new Error("Deux niveaux de collections au maximum.")
      parent = next.parentId
    }
  }
}
