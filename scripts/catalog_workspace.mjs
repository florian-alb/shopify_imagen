import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
const options = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, all) =>
        value.startsWith("--")
          ? [...pairs, [value.slice(2), all[i + 1] ?? ""]]
          : pairs,
      [],
    ),
)
const { deployment, id, command = "dry-run" } = options
if (
  !deployment ||
  !id ||
  !["dry-run", "migrate", "resume", "publish", "status", "rollback"].includes(
    command,
  )
)
  throw new Error(
    "Usage: node scripts/catalog_workspace.mjs --deployment NAME --id ID --command dry-run|migrate|resume|publish|status|rollback [--limit-batches N] [--report output/report.json]",
  )
if (
  deployment !== "curious-greyhound-437" &&
  options["allow-production"] !== deployment
)
  throw new Error(
    "Déploiement non-dev : fournissez --allow-production NAME uniquement après autorisation explicite de production.",
  )
console.log(`target: ${deployment}; command: ${command}; catalogue: ${id}`)
function run(action, cursor) {
  let result
  for (let attempt = 0; attempt < 3; attempt++) {
    result = spawnSync(
      "rtk",
      [
        "proxy",
        "npx",
        "convex",
        "run",
        "--deployment",
        deployment,
        "catalogMigration:step",
        JSON.stringify({ id, command: action, ...(cursor ? { cursor } : {}) }),
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    )
    if (result.status === 0) break
    if (!/Runtime exited|fetch failed|ECONNRESET/.test(result.stderr)) break
    console.warn(`Transient failure, retry ${attempt + 1}`)
  }
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}
const report = {
  deployment,
  id,
  command,
  startedAt: new Date().toISOString(),
  products: 0,
  postings: 0,
  bytes: [],
  variants: [],
  batches: [],
  ready: false,
}
const path = options.report ?? `output/catalog-${command}-${Date.now()}.json`
mkdirSync(dirname(path), { recursive: true })
const save = () => writeFileSync(path, JSON.stringify(report, null, 2) + "\n")
const limit = Number(options["limit-batches"] ?? 10000)
if (command === "migrate") run("begin")
if (["dry-run", "migrate", "resume"].includes(command)) {
  let cursor
  for (let batch = 0; batch < limit; batch++) {
    const result = run(command === "dry-run" ? "dry-run" : "step", cursor)
    report.products += result.products ?? 0
    report.postings += result.postings ?? 0
    report.bytes.push(...(result.bytes ?? []))
    report.variants.push(...(result.variants ?? []))
    report.batches.push({
      stage: result.stage,
      products: result.products,
      durationMs: result.durationMs,
    })
    console.log(JSON.stringify(report.batches.at(-1)))
    cursor = result.cursor
    report.cursor = cursor
    save()
    if ((command === "dry-run" && !cursor) || result.stage === "ready") {
      report.ready = true
      break
    }
  }
} else report.result = run(command)
if (command !== "dry-run") {
  const state = run("status")
  if (state) {
    report.checkpoint = {
      mode: state.mode,
      stage: state.stage,
      count: state.count,
      validated: state.validated,
      version: state.activeVersion,
      sourceRevision: state.sourceRevision,
      sourceGeneration: state.sourceGeneration,
      error: state.error ?? null,
    }
    report.ready = state.stage === "ready"
  }
}
// products/postings above count processed entries, including validation and retries.
// Only checkpoint.count is the number of distinct migrated products.
report.finishedAt = new Date().toISOString()
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? 0
report.sizeSummary = {
  p50: percentile(report.bytes, 0.5),
  p95: percentile(report.bytes, 0.95),
  max: Math.max(0, ...report.bytes),
}
save()
console.log(
  JSON.stringify({
    report: path,
    ready: report.ready,
    products: report.products,
    postings: report.postings,
    sizeSummary: report.sizeSummary,
  }),
)
