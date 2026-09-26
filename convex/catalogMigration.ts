"use node"

import { createHash } from "node:crypto"
import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { getJson, listKeys } from "./catalogImport/storage"
import { preparation } from "./catalogImport/pipeline"
import { indexEntries, resolveWorkspace } from "./catalogImport/workspaceModel"
import {
  bucketFor,
  matchesCollection,
  type CatalogProduct,
  type Preparation,
  type ProductOverride,
  safeKey,
} from "./catalogImport/model"

const hash = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item: unknown) => {
        if (item && typeof item === "object" && !Array.isArray(item))
          return Object.fromEntries(
            Object.entries(item).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0,
            ),
          )
        return item
      }),
    )
    .digest("hex")
/** Internal CLI entrypoint. No scraper, AI, Shopify write, or R2 write is reachable here. */
export const step = internalAction({
  args: {
    id: v.id("catalogOperations"),
    command: v.union(
      v.literal("dry-run"),
      v.literal("begin"),
      v.literal("step"),
      v.literal("publish"),
      v.literal("rollback"),
      v.literal("status"),
    ),
    cursor: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    try {
      const op = await ctx.runQuery(internal.catalogImport.context, {
        id: args.id,
      })
      if (op.type !== "export")
        throw new Error("Migration réservée aux catalogues source.")
      let state: Doc<"catalogWorkspaces"> | null = await ctx.runQuery(
        internal.catalogWorkspace.context,
        { id: op._id },
      )
      if (
        args.command === "status" ||
        (args.command === "step" && state?.mode === "active")
      )
        return state
      if (args.command === "rollback")
        return ctx.runMutation(internal.catalogWorkspace.rollback, {
          id: op._id,
          owner: op.ownerId,
        })
      if (op.activeTaskId || ["queued", "running"].includes(op.status))
        throw new Error(
          "Mettez le catalogue en pause et attendez son checkpoint.",
        )
      const rawPrep = await preparation(op)
      const fingerprint = hash({
        root: op.root,
        revision: op.revision,
        generation: op.generation,
        preparationKey: op.preparationKey,
        prep: rawPrep,
      })
      const prep: Preparation =
        state && state.mode !== "legacy"
          ? JSON.parse(state.preparation)
          : await preparation(op, true)
      if (args.command === "begin") {
        state = await ctx.runMutation(
          internal.catalogWorkspace.beginMigration,
          {
            id: op._id,
            owner: op.ownerId,
            preparation: JSON.stringify(prep),
            fingerprint,
          },
        )
        return state
      }
      if (args.command === "publish")
        return ctx.runMutation(internal.catalogWorkspace.publishMigration, {
          id: op._id,
          fingerprint,
        })
      const dry = args.command === "dry-run"
      if (!dry && (!state || state.mode !== "migration"))
        throw new Error("Commencez la migration avec begin.")
      if (!dry && state!.sourceFingerprint !== fingerprint)
        throw new Error("Préparation source modifiée ; aucune publication.")
      if (!dry && state!.stage === "ready") return state
      const started = performance.now()
      const cursor = dry ? args.cursor : state!.cursor
      const listing = await listKeys(`${op.root}/products/`, cursor, 25)
      let postings = 0
      const sizes: number[] = []
      const variants: number[] = []
      const overrideBuckets = new Map<string, Record<string, ProductOverride>>()
      for (const [bucket, key] of Object.entries(prep.overrideBuckets ?? {})) {
        const value = await getJson<Record<string, ProductOverride>>(key)
        if (!value) throw new Error(`Corrections absentes : ${key}`)
        overrideBuckets.set(bucket, value)
      }
      for (let offset = 0; offset < listing.keys.length; offset += 5) {
        const batch = await Promise.all(
          listing.keys.slice(offset, offset + 5).map(async (path) => ({
            path,
            product: await getJson<CatalogProduct>(path),
          })),
        )
        const summaries = await Promise.all(
          batch.map(({ product }) =>
            product
              ? getJson<{
                  handle: string
                  title: string
                  collections: string[]
                  partial?: boolean
                }>(`${op.root}/summaries/${safeKey(product.handle)}.json`)
              : null,
          ),
        )
        for (const [index, { path, product }] of batch.entries()) {
          if (!product) throw new Error(`Objet source absent : ${path}`)
          if (path !== `${op.root}/products/${safeKey(product.handle)}.json`)
            throw new Error(`Identité de fichier divergente : ${path}`)
          // A referenced override bucket must exist. Legacy readOverride's empty fallback
          // is deliberately not used for migration: missing corrections are data loss.
          const override =
            overrideBuckets.get(String(bucketFor(product.handle)))?.[
              product.handle
            ] ?? {}
          const summary = summaries[index]
          if (
            !summary ||
            summary.handle !== product.handle ||
            (summary.partial !== undefined &&
              summary.partial !== product.errors.length > 0)
          )
            throw new Error(
              `Résumé source absent ou divergent : ${product.handle}`,
            )
          const resolved = resolveWorkspace(product, prep, override)
          // The legacy list filters summaries before opening the product. Refuse a
          // stale summary or a normalization-dependent membership change instead
          // of silently changing the visible set during a storage migration.
          if (
            summary.title !== product.title ||
            hash([...(summary.collections ?? [])].sort()) !==
              hash([...product.collections].sort())
          )
            throw new Error(`Résumé source divergent : ${product.handle}`)
          const legacyTags =
            override.tags ??
            prep.collections
              .filter(
                (c) =>
                  c.selected &&
                  c.approved &&
                  summary.collections.includes(c.key),
              )
              .flatMap((c) => c.tags)
          if (
            prep.collections.some(
              (c) =>
                matchesCollection(legacyTags, c) !==
                resolved.scopes.includes(c.key),
            )
          )
            throw new Error(
              `Appartenance legacy divergente : ${product.handle}. Corrigez explicitement les tags avant migration.`,
            )
          postings += indexEntries(resolved).length
          const json = JSON.stringify(product)
          sizes.push(Buffer.byteLength(json))
          variants.push(product.variants.length)
          const productFingerprint = hash({ product, override })
          if (!dry && state!.stage === "copy") {
            await ctx.runMutation(internal.catalogWorkspace.migrateOne, {
              id: op._id,
              version: state!.activeVersion,
              json,
              override: JSON.stringify(override),
              fingerprint: productFingerprint,
            })
          } else if (!dry) {
            const stored: {
              source: Doc<"catalogSources">
              product: CatalogProduct
            } | null = await ctx.runQuery(
              internal.catalogWorkspace.inspectSource,
              { id: op._id, handle: product.handle },
            )
            if (
              !stored ||
              stored.source.fingerprint !== productFingerprint ||
              hash({
                product: stored.product,
                override: JSON.parse(stored.source.override),
              }) !== productFingerprint
            )
              throw new Error(`Validation différente : ${product.handle}`)
            await ctx.runQuery(internal.catalogWorkspace.validateMaterialized, {
              id: op._id,
              handle: product.handle,
            })
            // Compare the effective data as well as the untouched source/override payloads.
            if (
              hash(
                resolveWorkspace(
                  stored.product,
                  JSON.parse(state!.preparation) as Preparation,
                  JSON.parse(stored.source.override),
                ),
              ) !== hash(resolved)
            )
              throw new Error(`Classement différent : ${product.handle}`)
          }
        }
      }
      if (!dry)
        await ctx.runMutation(internal.catalogWorkspace.migrationProgress, {
          id: op._id,
          version: state!.activeVersion,
          expectedStage: state!.stage as "copy" | "validate",
          expectedCursor: cursor,
          cursor: listing.cursor,
          count: listing.keys.length,
          stage: listing.cursor
            ? (state!.stage as "copy" | "validate")
            : state!.stage === "copy"
              ? "validate"
              : "ready",
        })
      return {
        dryRun: dry,
        cursor: listing.cursor ?? null,
        stage: dry
          ? "inventory"
          : listing.cursor
            ? state!.stage
            : state!.stage === "copy"
              ? "validate"
              : "ready",
        products: listing.keys.length,
        postings,
        bytes: sizes,
        variants,
        durationMs: performance.now() - started,
      }
    } catch (error) {
      if (["begin", "step", "publish"].includes(args.command)) {
        const state = await ctx.runQuery(internal.catalogWorkspace.context, {
          id: args.id,
        })
        if (state?.mode === "migration")
          await ctx.runMutation(internal.catalogWorkspace.migrationFailure, {
            id: args.id,
            version: state.activeVersion,
            error:
              error instanceof Error ? error.message : "Migration interrompue",
          })
      }
      throw error
    }
  },
})
