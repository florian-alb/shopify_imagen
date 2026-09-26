import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import assert from "node:assert/strict"

// Deliberately dev-only. Creates its own catalogue/root; never imports to Shopify.
const deployment = "curious-greyhound-437"
const sourceId = process.argv[2]
const owner = process.argv[3]
if (!sourceId || !owner)
  throw new Error(
    "Usage: node scripts/rehearse_catalog_workspace.mjs SOURCE_DEV_ID OWNER",
  )
console.log(
  `target: dev (${deployment}); isolated edit/rules/R2 snapshot rehearsal`,
)
const report = { deployment, sourceId, checks: [] }
mkdirSync("output", { recursive: true })
const save = () =>
  writeFileSync(
    "output/catalog-rehearsal-dev.json",
    JSON.stringify(report, null, 2) + "\n",
  )
function call(name, args, expectedFailure = false) {
  const result = spawnSync(
    "rtk",
    [
      "proxy",
      "npx",
      "convex",
      "run",
      "--deployment",
      deployment,
      ...(name.startsWith("catalogImportActions:")
        ? ["--identity", JSON.stringify({ subject: owner })]
        : []),
      name,
      JSON.stringify(args),
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  )
  if (expectedFailure) {
    assert.notEqual(result.status, 0)
    return result.stderr
  }
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}
function checked(name) {
  report.checks.push(name)
  save()
  console.log(name)
}
async function until(read, predicate) {
  for (let i = 0; i < 45; i++) {
    const value = read()
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("Timed out waiting for scheduled dev work")
}
const handle = "affe-kuscheltier-in-pink"
const id = call("catalogWorkspace:rehearsalFixture", { id: sourceId, handle })
report.id = id
save()
const edit = {
  id,
  revision: 0,
  handle,
  patch: {
    title: "Affe — Katalogtest",
    tags: ["monkey", "pink"],
    reviewed: true,
  },
}
assert.equal(call("catalogImportActions:saveProduct", edit), 1)
assert.equal(call("catalogImportActions:saveProduct", edit), 1)
assert.match(
  call(
    "catalogImportActions:saveProduct",
    { ...edit, patch: { title: "stale" } },
    true,
  ),
  /révision|modifié|conflit|changé/i,
)
checked("product edit, lost-response replay and stale revision rejection")
let prep = call("catalogImportActions:structure", { id })
assert.equal(prep.revision, 1)
prep.collections = [
  {
    ...prep.collections[0],
    key: "rehearsal-monkey",
    url: "",
    title: "Monkey",
    targetTitle: "Monkey",
    tags: ["monkey", "pink"],
    match: "all",
    approved: true,
    selected: true,
  },
]
prep.menu = []
call("catalogImportActions:saveStructure", {
  id,
  revision: 1,
  json: JSON.stringify(prep),
  collect: false,
})
await until(
  () => call("catalogWorkspace:context", { id }),
  (s) => s.pendingVersion === undefined && s.stage === "ready",
)
const page = call("catalogImportActions:products", {
  id,
  collection: "rehearsal-monkey",
  search: "Katalog",
})
assert.equal(page.rows.length, 1)
assert.deepEqual(page.rows[0].tags, ["monkey", "pink"])
checked(
  "scheduled rule rebuild publishes matching membership and search together",
)
call("catalogImportActions:finalize", { id, allowPartial: false })
const op = await until(
  () => call("catalogImport:context", { id }),
  (op) => !!op.finalKey,
)
const url = call("catalogImportActions:download", { id })
const response = await fetch(url)
assert.equal(response.status, 200)
const snapshot = await response.text()
const json = JSON.parse(snapshot)
assert.equal(json.products.length, 1)
const shown = call("catalogImportActions:product", { id, handle })
assert.deepEqual(json.products[0], shown)
assert.equal(json.collections[0].key, "rehearsal-monkey")
report.finalKey = op.finalKey
checked("R2 snapshot equals current Convex detail and rules")
call("catalogImportActions:saveProduct", {
  id,
  revision: op.revision,
  handle,
  patch: { title: "Affe — Nach Export" },
})
const unchanged = await fetch(url)
assert.equal(await unchanged.text(), snapshot)
assert.match(
  call("catalogMigration:step", { id, command: "rollback" }, true),
  /interdit/,
)
checked(
  "snapshot remains immutable after later edit; unsafe legacy rollback refused",
)
report.finishedAt = new Date().toISOString()
save()
