import type { Assignment, SeoDocument, SeoNode } from "../types"

export function assignKeyword(document: SeoDocument, key: string, changes: Partial<Assignment>): SeoDocument {
  if (document.analysisVersion === 2 && changes.nodeId && !document.nodes.some(n => n.id === changes.nodeId && n.kind === "collection"))
    throw new Error("Un mot-clé de l’Excel peut être affecté uniquement à une collection, pas à un regroupement de menu.")
  const assignments = document.assignments.map(a => {
    if (a.key !== key) return a
    const next = { ...a, ...changes }
    if (next.relevance === "excluded") next.nodeId = null
    if (next.nodeId === null && next.relevance === "relevant") next.relevance = "review"
    return next
  })
  return { ...document, assignments, nodes: document.nodes.map(n => ({ ...n,
    primaryKey: n.primaryKey === key && !assignments.some(a => a.key === key && a.nodeId === n.id) ? null : n.primaryKey,
    origin: n.origin === "keywords" && !assignments.some(a => a.nodeId === n.id) ? n.sourceIds.length ? "competitor" : "ai" : n.origin,
  })) }
}
export function mergeNodes(document: SeoDocument, source: string, target: string): SeoDocument {
  if (source === target || !document.nodes.some(n => n.id === target)) throw new Error("Choisissez une autre page de destination.")
  const from = document.nodes.find(n => n.id === source)!
  if (document.analysisVersion === 2 && from.kind === "collection" && document.nodes.find(n => n.id === target)?.kind !== "collection")
    throw new Error("Fusionne une collection dans une autre collection pour conserver ses mots-clés mesurés.")
  let ancestor: SeoNode | undefined = document.nodes.find(n => n.id === target)
  while (ancestor) {
    if (ancestor.id === source) throw new Error("Impossible de fusionner une page vers l’un de ses descendants.")
    ancestor = document.nodes.find(n => n.id === ancestor?.parentId)
  }
  return { ...document,
    assignments: document.assignments.map(a => a.nodeId === source ? { ...a, nodeId: target } : a),
    nodes: document.nodes.filter(n => n.id !== source).map(n => ({ ...n, parentId: n.parentId === source ? target : n.parentId,
      ...(n.id === target ? { primaryKey: n.primaryKey ?? from.primaryKey, products: [...new Set([...n.products, ...from.products])],
        sourceIds: [...new Set([...n.sourceIds, ...from.sourceIds])] } : {}) })),
  }
}

export function orderedNodes(nodes: SeoNode[]) {
  const result: Array<{ node: SeoNode; depth: number }> = [], visited = new Set<string>()
  function visit(parentId: string | null, depth: number) {
    for (const node of nodes.filter(n => n.parentId === parentId)) {
      if (visited.has(node.id)) continue
      visited.add(node.id); result.push({ node, depth }); visit(node.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}
