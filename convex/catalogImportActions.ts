"use node"

import { randomUUID } from "node:crypto"
import { v } from "convex/values"
import { action, internalAction, type ActionCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { api, internal } from "./_generated/api"
import { requireUserId } from "./authz"
import {
  type Preparation,
  type PreparedProduct,
  type ProductOverride,
  type CatalogProduct,
  type MenuNode,
  type TaskSpec,
  bucketFor,
  safeKey,
  prepareProduct,
  validatePlans,
  matchesCollection,
  collectionKey,
  MAX_STRUCTURE_BYTES,
  validateStructureBudget,
} from "./catalogImport/model"
import { productOverride } from "./catalogImport/validators"
import {
  getJson,
  putJson,
  listKeys,
  downloadUrl,
  withCatalogWrites,
  measureReads,
} from "./catalogImport/storage"
import {
  digest,
  preparation,
  productPath,
  readOverride,
  runExportTask,
  spec,
  type Outcome,
  type WorkspaceIO,
} from "./catalogImport/pipeline"
import { CollectionHttpError } from "./catalogImport/network"
import { runImportTask, diagnoseShop } from "./catalogImport/shopify"
import { suggestCollections, suggestProductTags } from "./catalogImport/ai"

async function authorized(
  ctx: ActionCtx,
  id: Id<"catalogOperations">,
): Promise<Doc<"catalogOperations">> {
  const owner = await requireUserId(ctx)
  return ctx.runQuery(internal.catalogImport.context, { id, owner })
}
async function currentPreparation(
  ctx: ActionCtx,
  op: Doc<"catalogOperations">,
): Promise<Preparation> {
  if (op.storageMode !== "convex") return preparation(op)
  const state: Doc<"catalogWorkspaces"> | null = await ctx.runQuery(
    internal.catalogWorkspace.context,
    { id: op._id },
  )
  if (!state || state.mode !== "active")
    throw new Error("Catalogue de travail indisponible.")
  return { ...JSON.parse(state.preparation), revision: op.revision } as Preparation
}
async function currentProduct(
  ctx: ActionCtx,
  op: Doc<"catalogOperations">,
  handle: string,
): Promise<CatalogProduct | null> {
  if (op.storageMode !== "convex")
    return getJson<CatalogProduct>(productPath(op.root, handle))
  const source: { product: CatalogProduct } | null = await ctx.runQuery(
    internal.catalogWorkspace.inspectSource,
    { id: op._id, handle },
  )
  return source?.product ?? null
}
export const configuration = action({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    return {
      storage: Boolean(
        process.env.CATALOG_R2_BUCKET &&
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.CATALOG_R2_BUCKET !== process.env.R2_BUCKET,
      ),
      browser: Boolean(
        process.env.CATALOG_BROWSERLESS_URL &&
        process.env.CATALOG_BROWSERLESS_TOKEN,
      ),
      ai: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.CATALOG_CLASSIFIER_MODEL ?? "gemini-2.5-flash-lite",
    }
  },
})
export const structure = action({
  args: { id: v.id("catalogOperations") },
  handler: async (ctx, { id }): Promise<Preparation> => {
    return measureReads("structure", async () => {
      const op = await authorized(ctx, id)
      const prep = await currentPreparation(ctx, op)
      validateStructureBudget(prep)
      return prep
    })
  },
})
export const saveStructure = action({
  args: {
    id: v.id("catalogOperations"),
    revision: v.number(),
    json: v.string(),
    collect: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (Buffer.byteLength(args.json, "utf8") > MAX_STRUCTURE_BYTES)
      throw new Error("Structure trop volumineuse.")
    const candidate = JSON.parse(args.json) as Preparation
    if (!Array.isArray(candidate.collections) || !Array.isArray(candidate.menu))
      throw new Error("Structure invalide.")
    validateStructureBudget(candidate)
    validatePlans(candidate.collections)
    const owner = await requireUserId(ctx)
    const current = await authorized(ctx, args.id)
    if (current.storageMode === "convex") {
      const previous = await currentPreparation(ctx, current)
      const next: Preparation = {
        ...previous,
        collections: candidate.collections,
        menu: validateMenu(candidate.menu),
        revision: current.revision + 1,
      }
      let collectInput: string | undefined
      if (args.collect) {
        if (current.phase !== "menu")
          throw new Error("La collecte a déjà été démarrée.")
        const selected = next.collections.filter((c) => c.selected && c.url)
        if (
          !selected.length ||
          selected.some(
            (c) =>
              new URL(c.url).origin !== current.origin ||
              !collectionKey(c.url, current.origin),
          )
        )
          throw new Error("Sélection de collections source invalide.")
        collectInput = (await spec(current.root, "discover-0", "discover", {}))
          .inputKey
      }
      await ctx.runMutation(internal.catalogWorkspace.saveStructure, {
        id: args.id,
        owner,
        revision: args.revision,
        json: JSON.stringify(next),
        request: digest(JSON.stringify(args)),
        collectInput,
      })
      return next
    }
    const token = randomUUID()
    const op = await ctx.runMutation(internal.catalogImport.editLock, {
      id: args.id,
      owner,
      revision: args.revision,
      token,
    })
    try {
      const previous = await currentPreparation(ctx, op)
      // Only editable structure crosses the public boundary; internal R2 pointers are always server-owned.
      const prep: Preparation = {
        ...previous,
        collections: candidate.collections,
        menu: validateMenu(candidate.menu),
        revision: op.revision + 1,
      }
      const key = `${op.root}/preparation/${prep.revision}-${token}.json`
      const tasks: TaskSpec[] = []
      if (args.collect) {
        if (op.phase !== "menu")
          throw new Error(
            "La collecte a déjà été démarrée. Utilisez Reprendre ou Relancer.",
          )
        const selected = prep.collections.filter((c) => c.selected && c.url)
        if (!selected.length)
          throw new Error("Sélectionnez au moins une collection.")
        for (const c of selected)
          if (
            new URL(c.url).origin !== op.origin ||
            !collectionKey(c.url, op.origin)
          )
            throw new Error(
              "Une collection source doit appartenir au site choisi.",
            )
        tasks.push(await spec(op.root, "discover-0", "discover", {}))
      }
      await putJson(key, prep)
      await ctx.runMutation(internal.catalogImport.savePreparation, {
        id: op._id,
        token,
        key,
        tasks,
      })
      return prep
    } finally {
      await ctx.runMutation(internal.catalogImport.releaseEdit, {
        id: args.id,
        token,
      })
    }
  },
})
function validateMenu(value: MenuNode[], depth = 0): MenuNode[] {
  if (depth > 12 || value.length > 500)
    throw new Error("Menu trop profond ou trop volumineux.")
  return value.map((n) => {
    if (
      typeof n.key !== "string" ||
      typeof n.title !== "string" ||
      !Array.isArray(n.children)
    )
      throw new Error("Élément de menu invalide.")
    if (n.url && !/^https?:\/\//.test(n.url))
      throw new Error("Lien de menu invalide.")
    return {
      key: n.key.slice(0, 200),
      title: n.title.slice(0, 255),
      url: n.url,
      children: validateMenu(n.children, depth + 1),
    }
  })
}
export const products = action({
  args: {
    id: v.id("catalogOperations"),
    cursor: v.optional(v.string()),
    collection: v.optional(v.string()),
    search: v.optional(v.string()),
    onlyIssues: v.optional(v.boolean()),
    onlyErrors: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    rows: import("./catalogImport/workspaceModel").WorkspaceRow[]
    cursor: string | null
    scanned: number
  }> => {
    return measureReads("products", async () => {
      const op = await authorized(ctx, args.id)
      if (op.storageMode === "convex") {
        const page = await ctx.runQuery(api.catalogWorkspace.products, args)
        return {
          rows: JSON.parse(
            page.json,
          ) as import("./catalogImport/workspaceModel").WorkspaceRow[],
          cursor: page.cursor,
          scanned: page.scanned,
        }
      }
      const prep = await currentPreparation(ctx, op)
      let cursor = args.cursor
      let scanned = 0
      const rows = []
      const plan = prep.collections.find((c) => c.key === args.collection)
      const overrideCache = new Map<string, Record<string, ProductOverride>>()
      do {
        const listing = await listKeys(
          `${op.root}/summaries/`,
          cursor,
          50 - rows.length,
        )
        const summaries = await Promise.all(
          listing.keys.map((key) =>
            getJson<{
              handle: string
              title: string
              collections: string[]
              partial?: boolean
            }>(key),
          ),
        )
        for (const summary of summaries) {
          if (!summary) continue
          if (args.onlyErrors && summary.partial === false) continue
          const bucket = String(bucketFor(summary.handle))
          const overrideKey = prep.overrideBuckets?.[bucket]
          if (overrideKey && !overrideCache.has(bucket))
            overrideCache.set(
              bucket,
              (await getJson<Record<string, ProductOverride>>(overrideKey)) ??
                {},
            )
          const override = overrideCache.get(bucket)?.[summary.handle] ?? {}
          if (
            args.search &&
            !(override.title ?? summary.title)
              .toLowerCase()
              .includes(args.search.toLowerCase())
          )
            continue
          // Candidate filtering uses automatic target rules, including collections created after discovery.
          const tags =
            override.tags ??
            prep.collections
              .filter(
                (c) =>
                  c.selected &&
                  c.approved &&
                  summary.collections.includes(c.key),
              )
              .flatMap((c) => c.tags)
          if (plan && !matchesCollection(tags, plan)) continue
          const product = await getJson<CatalogProduct>(
            productPath(op.root, summary.handle),
          )
          if (!product) continue
          const prepared = prepareProduct(product, prep.collections, override)
          if (
            args.onlyErrors &&
            !prepared.errors.length &&
            prepared.jsonStatus === "complete" &&
            prepared.htmlStatus === "complete"
          )
            continue
          if (
            args.onlyIssues &&
            (prepared.reviewed ||
              (!prepared.errors.length && !prepared.warnings.length))
          )
            continue
          rows.push({
            handle: prepared.handle,
            title: prepared.title,
            url: prepared.url,
            errors: prepared.errors,
            image: prepared.images[0]?.url ?? null,
            variants: prepared.variants.length,
            tags: prepared.tags,
            collections: prepared.collections,
            jsonStatus: prepared.jsonStatus,
            htmlStatus: prepared.htmlStatus,
            issues: prepared.errors.length + prepared.warnings.length,
            excluded: prepared.excluded,
            reviewed: prepared.reviewed,
          })
        }
        cursor = listing.cursor
        scanned += listing.keys.length
      } while (cursor && rows.length < 50 && scanned < 500)
      return { rows, cursor: cursor ?? null, scanned }
    })
  },
})
export const product = action({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  handler: async (ctx, args): Promise<PreparedProduct> => {
    return measureReads("product", async () => {
      const op = await authorized(ctx, args.id)
      if (op.storageMode === "convex")
        return JSON.parse(
          await ctx.runQuery(api.catalogWorkspace.product, args),
        ) as PreparedProduct
      const prep = await currentPreparation(ctx, op)
      const product = await currentProduct(ctx, op, args.handle)
      if (!product) throw new Error("Produit introuvable.")
      return prepareProduct(
        product,
        prep.collections,
        await readOverride(prep, args.handle),
      )
    })
  },
})
export const saveProduct = action({
  args: {
    id: v.id("catalogOperations"),
    revision: v.number(),
    handle: v.string(),
    patch: productOverride,
  },
  handler: async (ctx, args): Promise<number> => {
    if (
      !args.handle ||
      args.handle.length > 255 ||
      ["__proto__", "constructor", "prototype"].includes(args.handle)
    )
      throw new Error("Identifiant produit invalide.")
    if (
      args.patch.title !== undefined &&
      (!args.patch.title.trim() || args.patch.title.length > 255)
    )
      throw new Error("Le titre doit contenir entre 1 et 255 caractères.")
    if (
      (args.patch.tags?.length ?? 0) > 250 ||
      args.patch.tags?.some((t) => t.length > 100)
    )
      throw new Error("Tags trop nombreux ou trop longs.")
    const owner = await requireUserId(ctx)
    const current = await authorized(ctx, args.id)
    if (current.storageMode === "convex")
      return ctx.runMutation(internal.catalogWorkspace.saveProduct, {
        id: args.id,
        owner,
        revision: args.revision,
        handle: args.handle,
        patch: JSON.stringify(args.patch),
        request: digest(JSON.stringify(args)),
      })
    const token = randomUUID()
    const op = await ctx.runMutation(internal.catalogImport.editLock, {
      id: args.id,
      owner,
      revision: args.revision,
      token,
    })
    try {
      if (!(await getJson(productPath(op.root, args.handle))))
        throw new Error("Produit introuvable.")
      const prep = await currentPreparation(ctx, op)
      const bucket = String(bucketFor(args.handle))
      const overrides = prep.overrideBuckets?.[bucket]
        ? ((await getJson<Record<string, ProductOverride>>(
            prep.overrideBuckets[bucket],
          )) ?? {})
        : {}
      overrides[args.handle] = { ...overrides[args.handle], ...args.patch }
      const overrideKey = `${op.root}/overrides/${op.revision + 1}-${token}/${bucket}.json`
      await putJson(overrideKey, overrides)
      const next = {
        ...prep,
        revision: op.revision + 1,
        overrideBuckets: { ...prep.overrideBuckets, [bucket]: overrideKey },
      }
      const key = `${op.root}/preparation/${next.revision}-${token}.json`
      await putJson(key, next)
      await ctx.runMutation(internal.catalogImport.savePreparation, {
        id: op._id,
        token,
        key,
        tasks: [],
      })
      return next.revision
    } finally {
      await ctx.runMutation(internal.catalogImport.releaseEdit, {
        id: args.id,
        token,
      })
    }
  },
})
export const proposeRules = action({
  args: { id: v.id("catalogOperations"), offset: v.number() },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    const prep = await currentPreparation(ctx, op)
    const offset = Math.max(0, Math.floor(args.offset))
    const plans = prep.collections.slice(offset, offset + 40)
    await ctx.runMutation(internal.catalogImport.reserveAi, {
      id: op._id,
      owner: op.ownerId,
      tokens: 66_000,
    })
    const result = await suggestCollections(plans)
    await ctx.runMutation(internal.catalogImport.reconcileAi, {
      id: op._id,
      reserved: 66_000,
      used: result.tokens || 66_000,
    })
    return {
      ...result,
      offset,
      nextOffset: offset + 40 < prep.collections.length ? offset + 40 : null,
    }
  },
})
export const proposeProduct = action({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    const prep = await currentPreparation(ctx, op)
    const product = await currentProduct(ctx, op, args.handle)
    if (!product) throw new Error("Produit introuvable.")
    await ctx.runMutation(internal.catalogImport.reserveAi, {
      id: op._id,
      owner: op.ownerId,
      tokens: 66_000,
    })
    const result = await suggestProductTags(product, prep.collections)
    await ctx.runMutation(internal.catalogImport.reconcileAi, {
      id: op._id,
      reserved: 66_000,
      used: result.tokens || 66_000,
    })
    return result
  },
})
export const finalize = action({
  args: { id: v.id("catalogOperations"), allowPartial: v.boolean() },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    if (op.type !== "export" || !op.total || op.done + op.failed === 0)
      throw new Error("Collectez les fiches avant de générer l’export.")
    if ((op.failed || op.status === "partial") && !args.allowPartial)
      throw new Error(
        "Des fiches sont incomplètes. Acceptez explicitement un export partiel.",
      )
    await ctx.runMutation(internal.catalogImport.enqueue, {
      id: op._id,
      owner: op.ownerId,
      phase: "assemble",
      tasks: [
        await spec(op.root, `assemble-${op.revision + 1}`, "assemble", {
          partial: args.allowPartial,
        }),
      ],
    })
  },
})
export const download = action({
  args: { id: v.id("catalogOperations") },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    if (!op.finalKey) throw new Error("L’export final n’est pas encore prêt.")
    return downloadUrl(op.finalKey)
  },
})
export const retryProduct = action({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    const p = await currentProduct(ctx, op, args.handle)
    if (!p) throw new Error("Produit introuvable.")
    await ctx.runMutation(internal.catalogImport.enqueue, {
      id: op._id,
      owner: op.ownerId,
      phase: "products",
      tasks: [
        await spec(
          op.root,
          `retry-${safeKey(args.handle)}-${Date.now()}`,
          "products",
          {
            products: [
              { handle: p.handle, url: p.url, collections: p.collections },
            ],
          },
        ),
      ],
    })
  },
})
export const importDiagnostic = action({
  args: { shopId: v.id("shops") },
  handler: async (
    ctx,
    { shopId },
  ): Promise<{ missing: string[]; currency: string; domain: string }> => {
    const owner = await requireUserId(ctx)
    const shop = await ctx.runQuery(internal.catalogImport.importShop, {
      shopId,
      owner,
    })
    return diagnoseShop(shop)
  },
})
export const startImport = action({
  args: {
    id: v.id("catalogOperations"),
    shopId: v.id("shops"),
    collections: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"catalogOperations">> => {
    const op = await authorized(ctx, args.id)
    const prep = await currentPreparation(ctx, op)
    if (!op.finalKey)
      throw new Error("Générez l’export final avant de lancer un import.")
    const selected = prep.collections.filter((c) =>
      args.collections.includes(c.key),
    )
    if (!selected.length || selected.some((c) => !c.approved || !c.tags.length))
      throw new Error(
        "Validez les règles de toutes les collections sélectionnées.",
      )
    const shop = await ctx.runQuery(internal.catalogImport.importShop, {
      shopId: args.shopId,
      owner: op.ownerId,
    })
    const diagnostic = await diagnoseShop(shop)
    if (diagnostic.missing.length)
      throw new Error(
        `Autorisations manquantes : ${diagnostic.missing.join(", ")}`,
      )
    return ctx.runMutation(internal.catalogImport.createImport, {
      exportId: op._id,
      owner: op.ownerId,
      shopId: args.shopId,
      collectionKeys: args.collections,
    })
  },
})
export const work = internalAction({
  args: { id: v.id("catalogOperations") },
  handler: async (ctx, { id }): Promise<void> => {
    const claim: {
      op: Doc<"catalogOperations">
      task: Doc<"catalogTasks">
    } | null = await ctx.runMutation(internal.catalogImport.claim, { id })
    if (!claim) return
    const { op, task } = claim
    const workspace: WorkspaceIO | undefined =
      op.storageMode === "convex"
        ? {
            preparation: () => currentPreparation(ctx, op),
            previous: async (product) =>
              ctx.runQuery(internal.catalogWorkspace.previousCollected, {
                id: op._id,
                handle: product.handle,
                sourceId: product.sourceId,
              }),
            collected: async (product) => {
              await ctx.runMutation(internal.catalogWorkspace.collected, {
                id: op._id,
                taskId: task._id,
                generation: op.generation,
                json: JSON.stringify(product),
                fingerprint: digest(JSON.stringify(product)),
              })
            },
            collection: async (collection, detail) => {
              await ctx.runMutation(
                internal.catalogWorkspace.collectStructure,
                {
                  id: op._id,
                  taskId: task._id,
                  generation: op.generation,
                  collection,
                  json: JSON.stringify(detail),
                },
              )
            },
            page: async (cursor) =>
              ctx.runQuery(internal.catalogWorkspace.snapshotPage, {
                id: op._id,
                revision: op.revision,
                generation: op.generation,
                cursor,
              }),
          }
        : undefined
    const receipt = `${op.root}/receipts/${safeKey(task.key)}/${digest(task.inputKey)}.json`
    try {
      let outcome = await getJson<Outcome>(receipt)
      if (!outcome) {
        outcome = await withCatalogWrites(op.root, op.generation, () =>
          op.type === "import"
            ? runImportTask(ctx, op, task)
            : runExportTask(op, task, workspace),
        )
        // A poll without a checkpoint must observe Shopify again next time, not replay an old pending result.
        if (outcome.complete || outcome.inputKey)
          await withCatalogWrites(op.root, op.generation, () =>
            putJson(receipt, outcome),
          )
      }
      if (
        op.storageMode === "convex" &&
        task.kind === "menu" &&
        outcome.preparationKey
      ) {
        const prep = await getJson<Preparation>(outcome.preparationKey)
        if (!prep) throw new Error("Préparation initiale absente.")
        await ctx.runMutation(internal.catalogWorkspace.initialize, {
          id: op._id,
          taskId: task._id,
          generation: op.generation,
          key: outcome.preparationKey,
          preparation: JSON.stringify(prep),
        })
      }
      await ctx.runMutation(internal.catalogImport.settle, {
        id,
        taskId: task._id,
        generation: op.generation,
        resultKey: receipt,
        ...outcome,
      })
    } catch (error) {
      await ctx.runMutation(internal.catalogImport.fail, {
        id,
        taskId: task._id,
        generation: op.generation,
        error: error instanceof Error ? error.message : "Échec du traitement",
        ...(error instanceof CollectionHttpError
          ? { retryMs: error.retryAfterMs, blocked: error.status === 403 }
          : {}),
      })
    }
  },
})

export const importResults = action({
  args: { id: v.id("catalogOperations"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const op = await authorized(ctx, args.id)
    if (op.type !== "import")
      throw new Error("Cette opération n’est pas un import.")
    const listing = await listKeys(`${op.root}/errors/`, args.cursor, 25)
    const errors = await Promise.all(
      listing.keys.map(async (key) => {
        const error = await getJson<{
          handle?: string
          source?: { handle: string }
          error?: string
          errors?: unknown
        }>(key)
        return {
          key,
          handle:
            error?.handle ??
            error?.source?.handle ??
            decodeURIComponent(
              key
                .split("/")
                .at(-1)
                ?.replace(/\.json$/, "") ?? "",
            ),
          message: (
            error?.error ?? JSON.stringify(error?.errors ?? "Erreur d’import")
          ).slice(0, 2000),
        }
      }),
    )
    const result = await getJson<{
      menu: { id: string; handle: string }
      status: string
      products: number
      failed: number
    }>(`${op.root}/result.json`)
    return { errors, cursor: listing.cursor ?? null, result }
  },
})
