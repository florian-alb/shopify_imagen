// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { writeFileSync, mkdirSync } from "node:fs"
import { performance } from "node:perf_hooks"
import schema from "../schema"
import { api } from "../_generated/api"
import { searchEntries, viewScope } from "./workspaceModel"
const modules = import.meta.glob("../**/*.ts")
const enabled = process.env.CATALOG_BENCHMARK === "1"
test.skipIf(!enabled)(
  "local indexed query scale at 1000 and 10000 synthetic products",
  async () => {
    const report: unknown[] = []
    for (const count of [1000, 10000]) {
      const t = convexTest(schema, modules)
      const owner = await t.run((ctx) =>
        ctx.db.insert("users", { approvalStatus: "approved" }),
      )
      const id = await t.run((ctx) =>
        ctx.db.insert("catalogOperations", {
          ownerId: owner,
          origin: "https://source.example",
          mode: "menu",
          type: "export",
          storageMode: "convex",
          status: "review",
          phase: "products",
          root: "synthetic",
          preparationKey: "prep",
          revision: 1,
          generation: 1,
          total: count,
          done: count,
          failed: 0,
          createdAt: 1,
          updatedAt: 1,
        }),
      )
      await t.run((ctx) =>
        ctx.db.insert("catalogWorkspaces", {
          operationId: id,
          mode: "active",
          activeVersion: 1,
          preparation: JSON.stringify({
            revision: 1,
            collections: [{ key: "small" }, { key: "large" }],
            menu: [],
          }),
          sourceRevision: 1,
          sourceGeneration: 1,
          sourcePreparationKey: "prep",
          sourceFingerprint: "synthetic",
          sourceRoot: "synthetic",
          count,
          validated: count,
          stage: "ready",
          edited: false,
          dataVersion: 1,
          searchGroups: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        }),
      )
      for (let start = 0; start < count; start += 50)
        await t.run(async (ctx) => {
          for (let n = start; n < Math.min(start + 50, count); n++) {
            const handle = `p${String(n).padStart(5, "0")}`
            const title =
              n % 97 === 0 ? `rare ${handle}` : `aaaa plush ${handle}`
            const sourceId = await ctx.db.insert("catalogSources", {
              operationId: id,
              handle,
              identity: handle,
              override: "{}",
              fingerprint: "synthetic",
              chunks: 0,
            })
            const row = {
              handle,
              title,
              url: "https://source.example/",
              errors: n % 97 === 0 ? ["HTTP 503"] : [],
              image: null,
              variants: 3,
              tags: ["rabbit"],
              collections: ["rabbit"],
              jsonStatus: "complete",
              htmlStatus: "complete",
              issues: n % 97 === 0 ? 1 : 0,
              excluded: false,
              reviewed: false,
            }
            const rowId = await ctx.db.insert("catalogRows", {
              operationId: id,
              version: 1,
              sourceId,
              handle,
              row: JSON.stringify(row),
              titleLower: title,
            })
            const scopes = [
              viewScope("", false, false),
              viewScope(n % 97 === 0 ? "small" : "large", false, false),
              ...(n % 97 === 0
                ? [viewScope("", true, false), viewScope("small", true, true)]
                : []),
            ]
            for (const scope of scopes)
              for (const entry of searchEntries(title, handle))
                await ctx.db.insert("catalogPostings", {
                  operationId: id,
                  version: 1,
                  scope,
                  rowId,
                  ...entry,
                })
          }
        })
      const user = t.withIdentity({ subject: owner })
      for (const args of [
        {},
        { search: "aa" },
        { collection: "small" },
        { search: "rare" },
        { onlyErrors: true },
        {
          collection: "small",
          search: "rare",
          onlyErrors: true,
          onlyIssues: true,
        },
      ]) {
        const samples: number[] = []
        let scanned = 0,
          payload = 0
        for (let run = 0; run < 10; run++) {
          const start = performance.now()
          const page = await user.query(api.catalogWorkspace.products, {
            id,
            ...args,
          })
          samples.push(performance.now() - start)
          scanned = page.scanned
          payload = page.json.length
          expect(JSON.parse(page.json).length).toBeLessThanOrEqual(50)
          expect(scanned).toBeLessThanOrEqual(51)
        }
        samples.sort((a, b) => a - b)
        report.push({
          count,
          filters: args,
          p50Ms: samples[5],
          p95Ms: samples[9],
          scanned,
          payloadBytes: payload,
        })
      }
    }
    mkdirSync("output", { recursive: true })
    writeFileSync(
      "output/catalog-synthetic-benchmark.json",
      JSON.stringify(
        { environment: "convex-test, local, not network latency", report },
        null,
        2,
      ),
    )
  },
  180000,
)
