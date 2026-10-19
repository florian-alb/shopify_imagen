import { describe, expect, test } from "vitest"
import { defaultConfig, metricsFor, priorityFor, validateMenuConfig, type Keyword, type SeoDocument, type SeoNode } from "./model"
import { parseDocument, validateDocument } from "./validation"

export const keyword: Keyword = { key: "row-2", row: 2, keyword: "montessori spielzeug 1 jahr", intent: "C", volume: 2400, kd: 22, cpc: 0.22, raw: [] }
export const node: SeoNode = { id: "one", parentId: null, title: "Spielzeug ab 1 Jahr", slug: "spielzeug-ab-1-jahr", kind: "collection", primaryKey: keyword.key,
  intent: "C", rationale: "Demande d’achat de jouets selon l’âge.", products: [], sourceIds: [], origin: "keywords", status: "pending", priorityOverride: null }
export function document(): SeoDocument { return { nodes: [{ ...node }], assignments: [{ key: keyword.key, nodeId: node.id, relevance: "relevant", inferredIntent: "C", reason: "Achat de jouets." }], sources: [], warnings: [] } }

describe("contrat de l’arborescence", () => {
  test("conserve les intentions multiples et n’accepte aucune métrique générée", () => {
    const result = parseDocument({ ...document(), volume: 999999 }, [{ ...keyword, intent: "I | C" }], [])
    expect(result).not.toHaveProperty("volume")
    expect(keyword.intent).toBe("C")
  })
  test("chaque ligne doit être affectée une seule fois, même une exclusion", () => {
    const d = document(); d.assignments = []
    expect(() => validateDocument(d, [keyword])).toThrow("exactement une affectation")
    d.assignments = [...document().assignments, ...document().assignments]
    expect(() => validateDocument(d, [keyword])).toThrow()
  })
  test("refuse un cycle, un parent inexistant et un troisième niveau de collections", () => {
    for (const parentId of ["one", "missing"]) {
      const d = document(); d.nodes[0].parentId = parentId
      expect(() => validateDocument(d, [keyword])).toThrow()
    }
    const d = document()
    d.nodes.push({ ...node, id: "two", slug: "two", parentId: "one", origin: "ai", primaryKey: null }, { ...node, id: "three", slug: "three", parentId: "two", origin: "ai", primaryKey: null })
    expect(() => validateDocument(d, [keyword])).toThrow("Deux niveaux")
  })
  test("refuse les références inventées et les slugs en double", () => {
    const d = document(); d.nodes[0].sourceIds = ["made-up"]
    expect(() => validateDocument(d, [keyword])).toThrow("Source concurrente")
    d.nodes[0].sourceIds = []; d.nodes.push({ ...node, id: "two", origin: "ai", primaryKey: null })
    expect(() => validateDocument(d, [keyword])).toThrow("même slug")
  })
  test("une exclusion ne peut pas alimenter une collection", () => {
    const d = document(); d.assignments[0].relevance = "excluded"
    expect(() => validateDocument(d, [keyword])).toThrow("excluded exige")
  })
  test("les doublons exacts ne gonflent pas le volume et zéro reste zéro", () => {
    const d = document(), duplicate = { ...keyword, key: "row-3", row: 3, keyword: "  MONTESSORI   spielzeug 1 jahr ", volume: 1300 }
    d.assignments.push({ ...d.assignments[0], key: duplicate.key })
    expect(metricsFor(node, [keyword, duplicate], d.assignments).declaredVolume).toBe(2400)
    expect(metricsFor(node, [{ ...keyword, volume: 0 }], d.assignments).primaryVolume).toBe(0)
    expect(metricsFor({ ...node, primaryKey: null }, [], []).declaredVolume).toBeNull()
  })
  test("la priorité dépend du périmètre, des seuils et d’un KD connu", () => {
    const d = document()
    expect(priorityFor(node, [keyword], d.assignments, defaultConfig)).toBe("P1")
    expect(priorityFor(node, [{ ...keyword, kd: null }], d.assignments, defaultConfig)).toBe("P2")
    expect(priorityFor(node, [keyword], [{ ...d.assignments[0], relevance: "review" }], defaultConfig)).toBe("P3")
    expect(priorityFor(node, [keyword], d.assignments, { ...defaultConfig, p1Volume: 5000 })).toBe("P2")
  })
})

describe("menu marchand v2", () => {
  const source = { id: "source-1", url: "https://example.com", kind: "menu", title: "Menu concurrent", headings: [], links: [], error: null }
  function menu(): SeoDocument { return { ...document(), analysisVersion: 2, opportunities: [] } }

  test("un produit étiqueté informationnel reste prioritaire, sans barrière de KD", () => {
    const d = menu(), product = { ...keyword, intent: "I", kd: 99 }
    d.assignments[0].inferredIntent = "I"
    expect(priorityFor(node, [product], d.assignments, defaultConfig, 2)).toBe("P1")
    expect(priorityFor(node, [{ ...product, kd: null }], d.assignments, defaultConfig, 2)).toBe("P1")
    expect(priorityFor(node, [{ ...product, volume: 500 }], d.assignments, defaultConfig, 2)).toBe("P2")
    expect(priorityFor(node, [product], d.assignments, defaultConfig)).toBe("P3")
  })
  test("une intention commerciale ne suffit pas à alimenter une collection", () => {
    const d = menu()
    d.assignments[0] = { ...d.assignments[0], inferredIntent: "T", relevance: "review" }
    expect(priorityFor(node, [{ ...keyword, intent: "T" }], d.assignments, defaultConfig, 2)).toBe("P3")
    expect(() => validateDocument(d, [keyword])).toThrow("affecté comme pertinent")
  })
  test("le menu n’accepte ni articles, ni fiches produits, ni accueil, ni filtres", () => {
    for (const kind of ["home", "guide", "product_need", "filter"] as const) {
      const d = menu(); d.nodes[0].kind = kind
      expect(() => validateDocument(d, [keyword])).toThrow("uniquement des collections")
      // Historical documents retain their original, broader structure.
      delete d.analysisVersion
      expect(() => validateDocument(d, [keyword])).not.toThrow()
    }
  })
  test("une collection exige un mot-clé importé principal et pertinent", () => {
    const d = menu()
    d.nodes[0].primaryKey = null
    expect(() => validateDocument(d, [keyword])).toThrow("mot-clé principal")
    d.nodes[0].primaryKey = "invented-key"
    expect(() => validateDocument(d, [keyword])).toThrow("mot-clé principal")
    d.assignments[0].key = "invented-key"
    expect(() => validateDocument(d, [keyword])).toThrow("Ligne source inconnue")
  })
  test("les opportunités restent hors menu avec leurs sources et sans métrique générée", () => {
    const d = menu(); d.sources = [source]
    const opportunity = { id: "opportunity-1", title: "Tours d’observation", rationale: "Catégorie du concurrent absente de l’export.", products: ["Tour d’observation"], sourceIds: [source.id], volume: 999999, keyword: "invented query" }
    const parsed = parseDocument({ ...d, opportunities: [opportunity] }, [keyword], [source])
    expect(parsed.opportunities).toEqual([{ id: opportunity.id, title: opportunity.title, rationale: opportunity.rationale, products: opportunity.products, sourceIds: opportunity.sourceIds }])
    expect(parsed.nodes).toHaveLength(1)
    expect(() => parseDocument({ ...d, opportunities: [{ ...opportunity, sourceIds: [] }] }, [keyword], [source])).toThrow("source concurrente vérifiée")
    expect(() => parseDocument({ ...d, opportunities: [{ ...opportunity, sourceIds: ["unseen"] }] }, [keyword], [source])).toThrow("source concurrente vérifiée")
  })
  test("un regroupement structurel n’a ni mot-clé, ni affectation, ni volume hérité", () => {
    const d = menu(), group: SeoNode = { ...node, id: "group", kind: "group", slug: "jouets", primaryKey: null, origin: "ai", priorityOverride: "P1" }
    d.nodes[0].parentId = group.id; d.nodes.unshift(group)
    expect(() => validateDocument(d, [keyword])).not.toThrow()
    expect(metricsFor(group, [keyword], d.assignments, 2)).toEqual({ primaryVolume: null, declaredVolume: null, kd: null, cpc: null })
    expect(priorityFor(group, [keyword], d.assignments, defaultConfig, 2)).toBe("P3")
    group.primaryKey = keyword.key
    expect(() => validateDocument(d, [keyword])).toThrow("ni mot-clé principal ni affectation")
    group.primaryKey = null; d.nodes[1].parentId = null
    expect(() => validateDocument(d, [keyword])).toThrow("organiser des collections")
  })
  test("les expressions à vérifier ne gonflent aucun volume v2", () => {
    const d = menu(), uncertain = { ...keyword, key: "row-3", keyword: "montessori schule", volume: 10000 }
    d.assignments.push({ ...d.assignments[0], key: uncertain.key, relevance: "review" })
    expect(metricsFor(node, [keyword, uncertain], d.assignments, 2).declaredVolume).toBe(2400)
    expect(metricsFor(node, [keyword, uncertain], d.assignments).declaredVolume).toBe(12400)
  })
  test("la version serveur empêche de contourner le contrat lors d’une sauvegarde", () => {
    const d = document(); d.nodes[0].kind = "guide"
    expect(() => parseDocument(d, [keyword], [], { analysisVersion: 2 })).toThrow("uniquement des collections")
    expect(parseDocument({ ...d, analysisVersion: 2 }, [keyword], [], {})).not.toHaveProperty("analysisVersion")
  })
  test("les groupes ne permettent pas de contourner les trois niveaux du menu", () => {
    const d = menu()
    const groups: SeoNode[] = [1, 2, 3].map((number, index) => ({ ...node, id: `group-${number}`, slug: `group-${number}`, kind: "group", primaryKey: null, origin: "ai", parentId: index ? `group-${number - 1}` : null }))
    d.nodes[0].parentId = "group-3"; d.nodes.unshift(...groups)
    expect(() => validateDocument(d, [keyword])).toThrow("Trois niveaux")
  })
  test("un nouveau menu exige un marché commun à l’Excel et à la boutique", () => {
    const config = { ...defaultConfig, theme: "Montessori", sourceCountry: "Allemagne", targetCountry: "  ALLEMAGNE ", targetLanguage: " DE " }
    expect(() => validateMenuConfig(config)).not.toThrow()
    expect(() => validateMenuConfig({ ...config, targetCountry: "France" })).toThrow("marché de la boutique")
    expect(() => validateMenuConfig({ ...config, targetLanguage: "fr" })).toThrow("marché de la boutique")
  })
})
