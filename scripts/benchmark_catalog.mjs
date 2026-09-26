import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
const opts = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (a, s, i, all) =>
        s.startsWith("--") ? [...a, [s.slice(2), all[i + 1]]] : a,
      [],
    ),
)
if (opts.deployment !== "curious-greyhound-437" || !opts.id || !opts.owner)
  throw new Error("Explicit dev deployment, id and owner required")
const samples = []
const scenarios = [
  ["all", "products", {}],
  ["rare", "products", { search: "capybara" }],
  ["errors", "products", { onlyErrors: true }],
  ["collection", "products", { collection: "capybara-kuscheltier" }],
  ["detail", "product", { handle: "affe-kuscheltier-in-pink" }],
  ["structure", "structure", {}],
]
for (let iteration = 0; iteration < Number(opts.samples ?? 5); iteration++) {
  for (const [name, action, args] of scenarios) {
    const start = performance.now()
    const result = spawnSync(
      "rtk",
      [
        "proxy",
        "npx",
        "convex",
        "run",
        "--deployment",
        opts.deployment,
        "--identity",
        JSON.stringify({ subject: opts.owner }),
        `catalogImportActions:${action}`,
        JSON.stringify({ id: opts.id, ...args }),
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    )
    if (result.status !== 0) {
      samples.push({
        name,
        iteration,
        error: result.stderr,
        cliMs: Math.round(performance.now() - start),
      })
      mkdirSync("output", { recursive: true })
      writeFileSync(
        `output/catalog-benchmark-${opts.label ?? "dev"}.json`,
        JSON.stringify(
          { deployment: opts.deployment, id: opts.id, samples },
          null,
          2,
        ),
      )
      continue
    }
    const match = result.stderr.match(/catalog-read[^\n]*?(\{[^\n]+\})/)
    const metrics = match ? JSON.parse(match[1].replace(/'$/, "")) : null
    const value = JSON.parse(result.stdout)
    const sample = {
      name,
      iteration,
      cliMs: Math.round(performance.now() - start),
      metrics,
      payloadBytes: Buffer.byteLength(result.stdout),
      rows: value.rows?.length,
      hasNext: !!value.cursor,
    }
    samples.push(sample)
    console.log(JSON.stringify(sample))
    mkdirSync("output", { recursive: true })
    writeFileSync(
      `output/catalog-benchmark-${opts.label ?? "dev"}.json`,
      JSON.stringify(
        { deployment: opts.deployment, id: opts.id, samples },
        null,
        2,
      ),
    )
  }
}
mkdirSync("output", { recursive: true })
writeFileSync(
  `output/catalog-benchmark-${opts.label ?? "dev"}.json`,
  JSON.stringify(
    { deployment: opts.deployment, id: opts.id, samples },
    null,
    2,
  ) + "\n",
)
