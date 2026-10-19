/** Read-only provider smoke test. Never writes to Convex or Shopify. */
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { parse } from "dotenv"
import { readWorkbook, buildExcel } from "../app/features/seo/lib/excel"
import { detectMapping, prepareKeywords, suggestLanguage } from "../app/features/seo/lib/import"
import { defaultConfig, priorityFor, type SourceObservation } from "../convex/seo/model"
import { generateStructure } from "../convex/seo/ai"
import { observeCompetitors } from "../convex/seo/competitors"

async function main() {
  const args = process.argv.slice(2)
  const [filename, ...urls] = args.filter(arg => !arg.startsWith("--"))
  const menusOnly = args.includes("--menus-only"), reuseMenus = args.includes("--reuse-menus")
  if (!filename) throw new Error("Usage : npx tsx scripts/seo_poc_check.ts fichier.xlsx [url-concurrent ...] [--menus-only|--reuse-menus]")
  const output = "output/seo-poc/v2"
  for (const path of [".env.local", ".env"]) {
    try {
      const env = parse(await readFile(path))
      for (const key of ["GEMINI_API_KEY", "SEO_ANALYSIS_MODEL", "CATALOG_CLASSIFIER_MODEL"])
        if (!process.env[key] && env[key]) process.env[key] = env[key]
    } catch { /* Environment can be injected by the caller. */ }
  }
  const bytes = await readFile(filename)
  const sheets = await readWorkbook({ size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer })
  const sheet = sheets.find(s => detectMapping(s.headers).keyword >= 0)
  if (!sheet) throw new Error("Aucun onglet de mots-clés détecté.")
  const { keywords, warnings } = prepareKeywords(sheet, detectMapping(sheet.headers))
  const config = { ...defaultConfig, theme: "Montessori", sourceCountry: "Allemagne", targetCountry: "Allemagne",
    sourceLanguage: suggestLanguage(keywords) || "de", targetLanguage: "de", competitors: urls.slice(0, 3) }
  console.log(`${keywords.length} lignes importées ; ${warnings.length} point(s) de qualité. Pays source non confirmé.`)
  await mkdir(output, { recursive: true })
  const sources: SourceObservation[] = reuseMenus ? JSON.parse(await readFile(`${output}/menus.json`, "utf8")) : await observeCompetitors(config.competitors)
  await writeFile(`${output}/menus.json`, JSON.stringify(sources, null, 2))
  function countMenu(nodes: NonNullable<SourceObservation["menu"]>): number { return nodes.reduce((count, node) => count + 1 + countMenu(node.children), 0) }
  const menuReport = sources.map(source => ({ url: source.url, language: source.language, menuStatus: source.menuStatus,
    nodes: countMenu(source.menu ?? []), error: source.error, extraction: source.extraction }))
  console.log(JSON.stringify({ sources: menuReport, snapshotBytes: new TextEncoder().encode(JSON.stringify(sources)).byteLength }, null, 2))
  if (menusOnly) return
  const { document, model, rawResponse } = await generateStructure(config, keywords, sources)
  // Source country is deliberately unknown in this smoke test. Provenance is owned by code.
  document.warnings.push("Pays source non confirmé. Allemagne et langue allemande utilisés comme hypothèse technique de test ; aucun volume Allemagne certifié.",
    "Regroupements sémantiques sans vérification SERP. Sommes des volumes déclarés : ni audience unique ni prévision de trafic.")
  await writeFile(`${output}/montessori.json`, JSON.stringify({ schemaVersion: 2, filename, headers: sheet.headers, config, keywords, model, ...document }, null, 2))
  await writeFile(`${output}/reponse-modele.json`, rawResponse)
  await writeFile(`${output}/montessori.xlsx`, new Uint8Array(await buildExcel(document, keywords, config, sheet.headers)))
  const assignment = (expression: string) => document.assignments.find(assignment => assignment.key === keywords.find(keyword => keyword.keyword === expression)?.key)
  const schoolExpressions = ["montessori schule", "montessori kindergarten", "montessori schulen", "montessori school", "montessori schule dachau", "maria montessori schulen", "montessorischule kaufering"]
  const oneYear = ["montessori spielzeug 1 jahr", "montessori spielzeug 1 jahre", "montessori spielzeuge 1 jahr", "montessori spielzeug ab 1 jahr"].map(expression => assignment(expression))
  const informationProducts = ["montessori material", "babyspielzeug 9 monate"].map(expression => assignment(expression))
  const checks = {
    analysisVersion2: document.analysisVersion === 2,
    oneAssignmentPerImportedRow: document.assignments.length === keywords.length && new Set(document.assignments.map(a => a.key)).size === keywords.length,
    merchantMenuOnly: document.nodes.every(node => ["collection", "group"].includes(node.kind)),
    everyCollectionMeasured: document.nodes.filter(node => node.kind === "collection").every(node => node.primaryKey && document.assignments.some(a => a.key === node.primaryKey && a.nodeId === node.id && a.relevance === "relevant")),
    schoolsExcludedRegardlessOfIntent: schoolExpressions.every(expression => assignment(expression)?.relevance === "excluded" && assignment(expression)?.nodeId === null),
    biographyExcluded: assignment("maria montessori")?.relevance === "excluded",
    informationLabelProductsRetained: informationProducts.every(a => a?.relevance === "relevant" && a.nodeId),
    informationProductPriorityUsesVolume: informationProducts.every(a => {
      const node = document.nodes.find(node => node.id === a?.nodeId)
      return node && priorityFor(node, keywords, document.assignments, config, 2) !== "P3"
    }),
    oneYearVariantsTogether: oneYear.every(a => a?.relevance === "relevant" && a.nodeId) && new Set(oneYear.map(a => a?.nodeId)).size === 1,
    unmeasuredLearningTowerOutsideMenu: !document.nodes.some(node => /lernt[uü]rm/i.test(node.title)) && (document.opportunities ?? []).some(opportunity => /lernt[uü]rm/i.test(opportunity.title)),
    opportunitiesOutsideMenu: (document.opportunities ?? []).every(opportunity => !document.nodes.some(node => node.id === opportunity.id) && opportunity.sourceIds.length > 0 && !Object.hasOwn(opportunity, "volume")),
    noInventedPopularity: (document.opportunities ?? []).every(opportunity => !/(?:pilier des ventes|très demand|tr[eè]s recherch|populaire|incontournable|rayon majeur)/i.test(opportunity.rationale)),
    foreignMenuObserved: sources.some(source => source.language?.startsWith("fr") && source.menu?.length),
    noSourceErrorHidden: sources.every(source => source.menuStatus && (source.menu?.length || source.menuStatus === "unavailable")),
  }
  const report = { model, nodes: document.nodes.length, collections: document.nodes.filter(node => node.kind === "collection").length,
    groups: document.nodes.filter(node => node.kind === "group").length, opportunities: document.opportunities?.length ?? 0, assignments: document.assignments.length,
    excluded: document.assignments.filter(a => a.relevance === "excluded").length,
    review: document.assignments.filter(a => a.relevance === "review").length,
    checks, sources: menuReport, output }
  await writeFile(`${output}/qualification.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (Object.values(checks).some(result => !result)) throw new Error("Une vérification métier Montessori a échoué. Consulter qualification.json et l’analyse sauvegardée.")
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Vérification impossible."); process.exitCode = 1 })
