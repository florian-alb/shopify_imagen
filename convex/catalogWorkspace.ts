import { v } from "convex/values"
import schema from "./schema"
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./authz"
import { ownedOperation } from "./catalogImport"
import {
  externalId,
  validatePlans,
  validateStructureBudget,
  type CatalogProduct,
  type Preparation,
} from "./catalogImport/model"
import {
  indexEntries,
  resolveWorkspace,
  searchCode,
  viewScope,
  type WorkspaceRow,
} from "./catalogImport/workspaceModel"

export async function workspace(ctx: QueryCtx, id: Id<"catalogOperations">) {
  return ctx.db
    .query("catalogWorkspaces")
    .withIndex("by_operationId", (q) => q.eq("operationId", id))
    .unique()
}
export async function assertWorkspaceUnlocked(
  ctx: QueryCtx,
  id: Id<"catalogOperations">,
) {
  const state = await workspace(ctx, id)
  if (state?.mode === "migration" || state?.pendingVersion !== undefined)
    throw new Error(
      "Migration ou mise à jour des classements en cours. Attendez sa validation.",
    )
}
export async function sourceRecord(
  ctx: QueryCtx,
  id: Id<"catalogOperations">,
  handle: string,
) {
  return ctx.db
    .query("catalogSources")
    .withIndex("by_operationId_and_handle", (q) =>
      q.eq("operationId", id).eq("handle", handle),
    )
    .unique()
}
export async function sourceBody(
  ctx: QueryCtx,
  source: Doc<"catalogSources">,
): Promise<CatalogProduct> {
  const chunks = await ctx.db
    .query("catalogBodies")
    .withIndex("by_sourceId_and_part", (q) => q.eq("sourceId", source._id))
    .take(65)
  if (chunks.length !== source.chunks || chunks.some((c, i) => c.part !== i))
    throw new Error("Contenu produit incomplet.")
  return JSON.parse(chunks.map((c) => c.json).join("")) as CatalogProduct
}
async function materialize(
  ctx: MutationCtx,
  op: Doc<"catalogOperations">,
  source: Doc<"catalogSources">,
  product: CatalogProduct,
  prep: Preparation,
  version: number,
) {
  const resolved = resolveWorkspace(product, prep, JSON.parse(source.override))
  const entries = indexEntries(resolved)
  const state = (await workspace(ctx, op._id))!
  const groups = [
    ...new Set([
      ...(state.searchGroups ?? []),
      ...entries.map((e) => e.minLength),
    ]),
  ].sort((a, b) => a - b)
  if (groups.length > 1024) throw new Error("Index de recherche trop complexe.")
  if (groups.length !== (state.searchGroups?.length ?? 0))
    await ctx.db.patch(state._id, { searchGroups: groups })
  const old = await ctx.db
    .query("catalogRows")
    .withIndex("by_operationId_and_version_and_handle", (q) =>
      q
        .eq("operationId", op._id)
        .eq("version", version)
        .eq("handle", source.handle),
    )
    .unique()
  if (old) {
    const postings = await ctx.db
      .query("catalogPostings")
      .withIndex("by_rowId", (q) => q.eq("rowId", old._id))
      .take(3501)
    if (postings.length > 3500) throw new Error("Index produit hors limite.")
    for (const entry of postings) await ctx.db.delete(entry._id)
  }
  const value = {
    operationId: op._id,
    version,
    handle: source.handle,
    sourceId: source._id,
    row: JSON.stringify(resolved.row),
    titleLower: resolved.row.title.toLowerCase(),
  }
  if (new TextEncoder().encode(value.row).length > 64_000)
    throw new Error("Résumé produit trop volumineux (64 Ko).")
  const rowId = old?._id ?? (await ctx.db.insert("catalogRows", value))
  if (old) await ctx.db.replace(old._id, value)
  for (const entry of entries)
    await ctx.db.insert("catalogPostings", {
      operationId: op._id,
      version,
      rowId,
      ...entry,
    })
  return entries.length
}
async function writeSource(
  ctx: MutationCtx,
  op: Doc<"catalogOperations">,
  json: string,
  override: string,
  fingerprint: string,
) {
  const product = JSON.parse(json) as CatalogProduct
  if (
    !product.handle ||
    !Array.isArray(product.variants) ||
    !Array.isArray(product.images)
  )
    throw new Error("Fiche source invalide.")
  const identity = product.sourceId
    ? externalId(op.origin, product.sourceId)
    : `url:${product.url}`
  const byIdentity = await ctx.db
    .query("catalogSources")
    .withIndex("by_operationId_and_identity", (q) =>
      q.eq("operationId", op._id).eq("identity", identity),
    )
    .unique()
  const byHandle = await sourceRecord(ctx, op._id, product.handle)
  if (byIdentity && byHandle && byIdentity._id !== byHandle._id)
    throw new Error("Identités source ambiguës ; aucune fusion automatique.")
  if (byIdentity && byIdentity.handle !== product.handle)
    throw new Error("Alias source à rapprocher avant migration.")
  const old = byIdentity ?? byHandle
  const pieces: string[] = []
  for (let start = 0; start < json.length; ) {
    let end = Math.min(start + 100_000, json.length)
    if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--
    pieces.push(json.slice(start, end))
    start = end
  }
  const chunks = pieces.length
  if (chunks > 64)
    throw new Error("Fiche trop volumineuse (6,4 millions de caractères).")
  const value = {
    operationId: op._id,
    identity,
    handle: product.handle,
    override,
    fingerprint,
    chunks,
  }
  const sourceId = old?._id ?? (await ctx.db.insert("catalogSources", value))
  if (old) {
    await ctx.db.replace(old._id, value)
    for (const chunk of await ctx.db
      .query("catalogBodies")
      .withIndex("by_sourceId_and_part", (q) => q.eq("sourceId", sourceId))
      .take(65))
      await ctx.db.delete(chunk._id)
  }
  for (let part = 0; part < chunks; part++)
    await ctx.db.insert("catalogBodies", { sourceId, part, json: pieces[part] })
  return { source: (await ctx.db.get(sourceId))!, product }
}
export const state = query({
  args: { id: v.id("catalogOperations") },
  returns: v.union(
    v.object({
      ...schema.tables.catalogWorkspaces.validator.fields,
      _id: v.id("catalogWorkspaces"),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await ownedOperation(ctx, id, await requireUserId(ctx))
    return workspace(ctx, id)
  },
})
export const context = internalQuery({
  args: { id: v.id("catalogOperations") },
  returns: v.union(
    v.object({
      ...schema.tables.catalogWorkspaces.validator.fields,
      _id: v.id("catalogWorkspaces"),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => workspace(ctx, id),
})
export const structure = query({
  args: { id: v.id("catalogOperations") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { id }) => {
    const op = await ownedOperation(ctx, id, await requireUserId(ctx))
    const s = await workspace(ctx, id)
    return op.storageMode === "convex" && s?.mode === "active"
      ? JSON.stringify({ ...JSON.parse(s.preparation), revision: op.revision })
      : null
  },
})
export const product = query({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  returns: v.string(),
  handler: async (ctx, { id, handle }) => {
    const op = await ownedOperation(ctx, id, await requireUserId(ctx))
    const s = await workspace(ctx, id)
    if (op.storageMode !== "convex" || s?.mode !== "active")
      throw new Error("Catalogue non migré.")
    const source = await sourceRecord(ctx, id, handle)
    if (!source) throw new Error("Produit introuvable.")
    return JSON.stringify(
      resolveWorkspace(
        await sourceBody(ctx, source),
        JSON.parse(s.preparation),
        JSON.parse(source.override),
      ).product,
    )
  },
})
export const products = query({
  args: {
    id: v.id("catalogOperations"),
    cursor: v.optional(v.string()),
    collection: v.optional(v.string()),
    search: v.optional(v.string()),
    onlyErrors: v.optional(v.boolean()),
    onlyIssues: v.optional(v.boolean()),
  },
  returns: v.object({
    json: v.string(),
    cursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    reset: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, await requireUserId(ctx))
    const s = await workspace(ctx, args.id)
    if (op.storageMode !== "convex" || s?.mode !== "active")
      throw new Error("Catalogue non migré.")
    const search = (args.search ?? "").toLowerCase()
    const plans = (JSON.parse(s.preparation) as Preparation).collections
    const collection = plans.some((c) => c.key === args.collection)
      ? args.collection!
      : ""
    const scope = viewScope(collection, !!args.onlyErrors, !!args.onlyIssues)
    const binding = JSON.stringify([
      args.id,
      s.activeVersion,
      s.dataVersion,
      scope,
      search,
    ])
    const prefix = search ? searchCode(search) : "!"
    let after: string | undefined
    let startGroup = 0
    let reset = false
    if (args.cursor) {
      const cursor = JSON.parse(args.cursor) as {
        binding: string
        after: string
        group: number
      }
      if (
        cursor.binding === binding &&
        typeof cursor.after === "string" &&
        cursor.after.startsWith(prefix) &&
        Number.isInteger(cursor.group)
      ) {
        after = cursor.after
        startGroup = cursor.group
      } else reset = true
    }
    const rows: WorkspaceRow[] = []
    let scanned = 0
    let last = after
    let lastGroup = startGroup
    const upper =
      prefix.slice(0, -1) +
      String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
    const groups = search
      ? (s.searchGroups ?? [1])
          .filter((g) => g > 0 && g <= search.length && g >= startGroup)
          .sort((a, b) => a - b)
      : [0]
    for (const group of groups) {
      const indexed = ctx.db
        .query("catalogPostings")
        .withIndex(
          "by_operationId_and_version_and_scope_and_minLength_and_sort",
          (q) => {
            const base = q
              .eq("operationId", args.id)
              .eq("version", s.activeVersion)
              .eq("scope", scope)
              .eq("minLength", group)
            return after && group === startGroup
              ? base.gt("sort", after).lt("sort", upper)
              : base.gte("sort", prefix).lt("sort", upper)
          },
        )
      for await (const posting of indexed) {
        scanned++
        if (rows.length === 50)
          return {
            json: JSON.stringify(rows),
            cursor: JSON.stringify({ binding, after: last, group: lastGroup }),
            scanned,
            reset,
          }
        const row = await ctx.db.get(posting.rowId)
        if (
          !row ||
          row.operationId !== op._id ||
          row.version !== s.activeVersion
        )
          throw new Error("Index incohérent.")
        if (search && row.titleLower.indexOf(search) !== posting.position)
          throw new Error("Occurrence de recherche incohérente.")
        rows.push(JSON.parse(row.row))
        last = posting.sort
        lastGroup = group
      }
    }
    return { json: JSON.stringify(rows), cursor: null, scanned, reset }
  },
})
export const beginMigration = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    preparation: v.string(),
    fingerprint: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    const old = await workspace(ctx, op._id)
    if (old && old.mode !== "legacy") return old
    if (
      op.type !== "export" ||
      op.activeTaskId ||
      ["running", "queued"].includes(op.status) ||
      (op.editUntil ?? 0) > Date.now()
    )
      throw new Error("Le catalogue doit être inactif avant migration.")
    const prep = JSON.parse(args.preparation) as Preparation
    validateStructureBudget(prep)
    validatePlans(prep.collections)
    const data = {
      operationId: op._id,
      mode: "migration" as const,
      activeVersion: (old?.activeVersion ?? 0) + 1,
      preparation: args.preparation,
      sourceRevision: op.revision,
      sourceGeneration: op.generation,
      sourcePreparationKey: op.preparationKey!,
      sourceFingerprint: args.fingerprint,
      sourceRoot: op.root,
      count: 0,
      validated: 0,
      stage: "copy" as const,
      edited: false,
      dataVersion: 0,
    }
    const id = old?._id ?? (await ctx.db.insert("catalogWorkspaces", data))
    if (old) await ctx.db.replace(old._id, data)
    await ctx.db.patch(op._id, { storageMode: "migration" })
    return ctx.db.get(id)
  },
})
function migrationFence(
  op: Doc<"catalogOperations">,
  s: Doc<"catalogWorkspaces">,
) {
  if (
    s.mode !== "migration" ||
    op.revision !== s.sourceRevision ||
    op.generation !== s.sourceGeneration ||
    op.preparationKey !== s.sourcePreparationKey ||
    op.root !== s.sourceRoot
  )
    throw new Error("La source a changé ; migration non publiée.")
}
export const migrateOne = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    version: v.number(),
    json: v.string(),
    override: v.string(),
    fingerprint: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = (await workspace(ctx, args.id))!
    migrationFence(op, s)
    if (s.stage !== "copy" || s.activeVersion !== args.version)
      throw new Error("Tentative de migration périmée.")
    const { source, product } = await writeSource(
      ctx,
      op,
      args.json,
      args.override,
      args.fingerprint,
    )
    return materialize(
      ctx,
      op,
      source,
      product,
      JSON.parse(s.preparation),
      s.activeVersion,
    )
  },
})
export const migrationProgress = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    version: v.number(),
    expectedStage: v.union(v.literal("copy"), v.literal("validate")),
    expectedCursor: v.optional(v.string()),
    cursor: v.optional(v.string()),
    count: v.number(),
    stage: v.union(
      v.literal("copy"),
      v.literal("validate"),
      v.literal("ready"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = (await workspace(ctx, args.id))!
    migrationFence(op, s)
    if (
      s.activeVersion !== args.version ||
      s.stage !== args.expectedStage ||
      s.cursor !== args.expectedCursor
    )
      throw new Error("Checkpoint remplacé ; reprenez la migration.")
    await ctx.db.patch(s._id, {
      cursor: args.cursor,
      stage: args.stage,
      ...(s.stage === "copy"
        ? { count: s.count + args.count }
        : { validated: s.validated + args.count }),
      error: undefined,
    })
    return null
  },
})
export const inspectSource = internalQuery({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  returns: v.any(),
  handler: async (ctx, { id, handle }) => {
    const source = await sourceRecord(ctx, id, handle)
    return source ? { source, product: await sourceBody(ctx, source) } : null
  },
})
export const publishMigration = internalMutation({
  args: { id: v.id("catalogOperations"), fingerprint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = (await workspace(ctx, args.id))!
    if (s.mode === "active" && s.sourceFingerprint === args.fingerprint)
      return null
    migrationFence(op, s)
    if (
      s.stage !== "ready" ||
      s.count !== s.validated ||
      s.count !== op.done + op.failed ||
      s.sourceFingerprint !== args.fingerprint
    )
      throw new Error("Validation de migration incomplète.")
    await ctx.db.patch(s._id, { mode: "active" })
    await ctx.db.patch(op._id, { storageMode: "convex" })
    if (s.activeVersion > 1)
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.pruneVersion, {
        id: op._id,
        version: s.activeVersion - 1,
      })
    return null
  },
})
export const rollback = internalMutation({
  args: { id: v.id("catalogOperations"), owner: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { id, owner }) => {
    const op = await ownedOperation(ctx, id, owner)
    const s = await workspace(ctx, id)
    if (!s) return null
    if (
      s.edited ||
      op.activeTaskId ||
      op.revision !== s.sourceRevision ||
      op.generation !== s.sourceGeneration ||
      s.pendingVersion !== undefined
    )
      throw new Error(
        "Retour legacy interdit après édition, collecte ou changement de révision. Réparation en avant nécessaire.",
      )
    await ctx.db.patch(s._id, { mode: "legacy" })
    await ctx.db.patch(op._id, { storageMode: undefined })
    return null
  },
})
export const saveProduct = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    revision: v.number(),
    handle: v.string(),
    patch: v.string(),
    request: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    const s = await workspace(ctx, op._id)
    if (s?.mode !== "active" || op.storageMode !== "convex")
      throw new Error("Catalogue non migré.")
    if (s.lastRequest === args.request) return s.lastResult!
    await assertWorkspaceUnlocked(ctx, op._id)
    if (
      op.snapshotRevision !== undefined ||
      op.revision !== args.revision ||
      op.activeTaskId ||
      ["queued", "running"].includes(op.status)
    )
      throw new Error(
        "Ce catalogue a changé ou un traitement est en cours. Rechargez avant d’enregistrer.",
      )
    const source = await sourceRecord(ctx, op._id, args.handle)
    if (!source) throw new Error("Produit introuvable.")
    const override = JSON.stringify({
      ...JSON.parse(source.override),
      ...JSON.parse(args.patch),
    })
    await ctx.db.patch(source._id, { override })
    await materialize(
      ctx,
      op,
      { ...source, override },
      await sourceBody(ctx, source),
      JSON.parse(s.preparation),
      s.activeVersion,
    )
    const revision = op.revision + 1
    await ctx.db.patch(s._id, {
      edited: true,
      dataVersion: s.dataVersion + 1,
      lastRequest: args.request,
      lastResult: revision,
      preparation: JSON.stringify({ ...JSON.parse(s.preparation), revision }),
    })
    await ctx.db.patch(op._id, {
      revision,
      finalKey: undefined,
      status: op.status === "completed" ? "review" : op.status,
      updatedAt: Date.now(),
    })
    return revision
  },
})
export const saveStructure = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    revision: v.number(),
    json: v.string(),
    request: v.string(),
    collectInput: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    const s = await workspace(ctx, op._id)
    if (s?.mode !== "active") throw new Error("Catalogue non migré.")
    if (s.lastRequest === args.request) return null
    await assertWorkspaceUnlocked(ctx, op._id)
    if (
      op.snapshotRevision !== undefined ||
      op.revision !== args.revision ||
      op.activeTaskId ||
      ["queued", "running"].includes(op.status)
    )
      throw new Error("Ce catalogue a changé ou un traitement est en cours.")
    const next = JSON.parse(args.json) as Preparation
    validateStructureBudget(next)
    validatePlans(next.collections)
    const version = s.activeVersion + 1
    await ctx.db.patch(s._id, {
      pendingVersion: version,
      pendingCollectInput: args.collectInput,
      pendingPreparation: JSON.stringify({
        ...next,
        revision: op.revision + 1,
      }),
      stage: "rebuild",
      cursor: undefined,
      validated: 0,
      error: undefined,
      lastRequest: args.request,
    })
    await ctx.scheduler.runAfter(0, internal.catalogWorkspace.rebuild, {
      id: op._id,
      version,
    })
    return null
  },
})
export const rebuildBatch = internalMutation({
  args: { id: v.id("catalogOperations"), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, version }) => {
    const op = (await ctx.db.get(id))!
    const s = await workspace(ctx, id)
    if (!s || s.pendingVersion !== version) return null
    const source = await ctx.db
      .query("catalogSources")
      .withIndex("by_operationId_and_handle", (q) =>
        q.eq("operationId", id).gt("handle", s.cursor ?? ""),
      )
      .first()
    if (source) {
      await materialize(
        ctx,
        op,
        source,
        await sourceBody(ctx, source),
        JSON.parse(s.pendingPreparation!),
        version,
      )
      await ctx.db.patch(s._id, {
        cursor: source.handle,
        validated: s.validated + 1,
      })
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.rebuild, {
        id,
        version,
      })
    } else {
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.pruneVersion, {
        id,
        version: s.activeVersion,
      })
      await ctx.db.patch(s._id, {
        error: undefined,
        activeVersion: version,
        preparation: s.pendingPreparation!,
        pendingVersion: undefined,
        pendingPreparation: undefined,
        stage: "ready",
        cursor: undefined,
        edited: true,
        dataVersion: s.dataVersion + 1,
      })
      if (s.pendingCollectInput) {
        await ctx.runMutation(internal.catalogImport.enqueue, {
          id,
          owner: op.ownerId,
          phase: "discover",
          tasks: [
            {
              key: "discover-0",
              kind: "discover",
              inputKey: s.pendingCollectInput,
            },
          ],
        })
        await ctx.db.patch(s._id, { pendingCollectInput: undefined })
      } else
        await ctx.db.patch(id, {
          revision: op.revision + 1,
          finalKey: undefined,
          updatedAt: Date.now(),
        })
    }
    return null
  },
})
export const snapshotPage = internalQuery({
  args: {
    id: v.id("catalogOperations"),
    revision: v.number(),
    generation: v.number(),
    cursor: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = await workspace(ctx, args.id)
    if (
      s?.mode !== "active" ||
      s.pendingVersion !== undefined ||
      op.revision !== args.revision ||
      op.generation !== args.generation ||
      !op.activeTaskId
    )
      throw new Error("Snapshot remplacé ou catalogue occupé.")
    const sources = await ctx.db
      .query("catalogSources")
      .withIndex("by_operationId_and_handle", (q) =>
        q.eq("operationId", args.id).gt("handle", args.cursor ?? ""),
      )
      .take(5)
    const prep = JSON.parse(s.preparation) as Preparation
    const products = []
    for (const source of sources)
      products.push(
        resolveWorkspace(
          await sourceBody(ctx, source),
          prep,
          JSON.parse(source.override),
        ).product,
      )
    return {
      products,
      cursor: sources.length === 5 ? sources.at(-1)!.handle : null,
    }
  },
})
export const collected = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    taskId: v.id("catalogTasks"),
    generation: v.number(),
    json: v.string(),
    fingerprint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = await workspace(ctx, args.id)
    if (
      op.generation !== args.generation ||
      op.activeTaskId !== args.taskId ||
      s?.mode !== "active" ||
      s.pendingVersion !== undefined
    )
      throw new Error("Worker périmé.")
    const candidate = JSON.parse(args.json) as CatalogProduct
    const previous = await sourceRecord(ctx, op._id, candidate.handle)
    const { source, product } = await writeSource(
      ctx,
      op,
      args.json,
      previous?.override ?? "{}",
      args.fingerprint,
    )
    await materialize(
      ctx,
      op,
      source,
      product,
      JSON.parse(s.preparation),
      s.activeVersion,
    )
    await ctx.db.patch(s._id, { edited: true, dataVersion: s.dataVersion + 1 })
    return null
  },
})

export const initialize = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    taskId: v.id("catalogTasks"),
    generation: v.number(),
    key: v.string(),
    preparation: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    if (op.generation !== args.generation || op.activeTaskId !== args.taskId)
      throw new Error("Worker périmé.")
    if (await workspace(ctx, op._id)) return null
    await ctx.db.insert("catalogWorkspaces", {
      operationId: op._id,
      mode: "active",
      activeVersion: 1,
      preparation: args.preparation,
      sourceRevision: op.revision,
      sourceGeneration: op.generation,
      sourcePreparationKey: args.key,
      sourceFingerprint: "new",
      sourceRoot: op.root,
      count: 0,
      validated: 0,
      stage: "ready",
      edited: true,
      dataVersion: 0,
    })
    return null
  },
})
export const collectStructure = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    taskId: v.id("catalogTasks"),
    generation: v.number(),
    collection: v.string(),
    json: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const s = await workspace(ctx, args.id)
    if (
      op.generation !== args.generation ||
      op.activeTaskId !== args.taskId ||
      s?.mode !== "active"
    )
      throw new Error("Worker périmé.")
    const prep = JSON.parse(s.preparation) as Preparation
    const detail = JSON.parse(args.json) as Partial<
      Preparation["collections"][number]
    >
    const collection = prep.collections.find((c) => c.key === args.collection)
    if (collection)
      for (const field of [
        "description",
        "seoTitle",
        "seoDescription",
        "image",
      ] as const)
        if (!collection[field] && detail[field])
          collection[field] = detail[field]!
    validateStructureBudget(prep)
    await ctx.db.patch(s._id, {
      preparation: JSON.stringify(prep),
      dataVersion: s.dataVersion + 1,
      edited: true,
    })
    return null
  },
})
export const resumeRebuild = internalMutation({
  args: { id: v.id("catalogOperations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const s = await workspace(ctx, id)
    if (s?.pendingVersion !== undefined)
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.rebuild, {
        id,
        version: s.pendingVersion,
      })
    return null
  },
})

export const validateMaterialized = internalQuery({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, handle }) => {
    const s = (await workspace(ctx, id))!
    const source = (await sourceRecord(ctx, id, handle))!
    const expected = resolveWorkspace(
      await sourceBody(ctx, source),
      JSON.parse(s.preparation),
      JSON.parse(source.override),
    )
    const row = await ctx.db
      .query("catalogRows")
      .withIndex("by_operationId_and_version_and_handle", (q) =>
        q
          .eq("operationId", id)
          .eq("version", s.activeVersion)
          .eq("handle", handle),
      )
      .unique()
    if (!row || row.row !== JSON.stringify(expected.row))
      throw new Error(`Résumé différent : ${handle}`)
    const entries = await ctx.db
      .query("catalogPostings")
      .withIndex("by_rowId", (q) => q.eq("rowId", row._id))
      .take(3501)
    const canonical = (
      values: {
        scope: string
        sort: string
        position: number
        minLength: number
      }[],
    ) =>
      values
        .map((e) => JSON.stringify([e.scope, e.sort, e.position, e.minLength]))
        .sort()
        .join("\n")
    if (canonical(entries) !== canonical(indexEntries(expected)))
      throw new Error(`Appartenances ou recherche différentes : ${handle}`)
    return null
  },
})

export const previousCollected = internalQuery({
  args: {
    id: v.id("catalogOperations"),
    handle: v.string(),
    sourceId: v.union(v.string(), v.null()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const op = (await ctx.db.get(args.id))!
    const existing = args.sourceId
      ? await ctx.db
          .query("catalogSources")
          .withIndex("by_operationId_and_identity", (q) =>
            q
              .eq("operationId", op._id)
              .eq("identity", externalId(op.origin, args.sourceId!)),
          )
          .unique()
      : null
    const source = existing ?? (await sourceRecord(ctx, op._id, args.handle))
    return source ? sourceBody(ctx, source) : null
  },
})

export const rebuild = internalMutation({
  args: { id: v.id("catalogOperations"), version: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.catalogWorkspace.rebuildBatch, args)
    } catch (error) {
      const s = await workspace(ctx, args.id)
      if (s?.pendingVersion === args.version)
        await ctx.db.patch(s._id, {
          error: (error instanceof Error
            ? error.message
            : "Recalcul interrompu"
          ).slice(0, 1000),
        })
    }
    return null
  },
})
export const retryClassification = mutation({
  args: { id: v.id("catalogOperations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ownedOperation(ctx, id, await requireUserId(ctx))
    const s = await workspace(ctx, id)
    if (s?.pendingVersion !== undefined) {
      await ctx.db.patch(s._id, { error: undefined })
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.rebuild, {
        id,
        version: s.pendingVersion,
      })
    }
    return null
  },
})
export const pruneVersion = internalMutation({
  args: { id: v.id("catalogOperations"), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, version }) => {
    const s = await workspace(ctx, id)
    if (!s || s.activeVersion === version || s.pendingVersion === version)
      return null
    const entries = await ctx.db
      .query("catalogPostings")
      .withIndex(
        "by_operationId_and_version_and_scope_and_minLength_and_sort",
        (q) => q.eq("operationId", id).eq("version", version),
      )
      .take(200)
    for (const entry of entries) await ctx.db.delete(entry._id)
    const rows = entries.length
      ? []
      : await ctx.db
          .query("catalogRows")
          .withIndex("by_operationId_and_version_and_handle", (q) =>
            q.eq("operationId", id).eq("version", version),
          )
          .take(100)
    for (const row of rows) await ctx.db.delete(row._id)
    if (entries.length || rows.length)
      await ctx.scheduler.runAfter(0, internal.catalogWorkspace.pruneVersion, {
        id,
        version,
      })
    return null
  },
})

/** Development-only rehearsal: isolated Convex data and a separate R2 snapshot root. */
export const rehearsalFixture = internalMutation({
  args: { id: v.id("catalogOperations"), handle: v.string() },
  returns: v.id("catalogOperations"),
  handler: async (ctx, args) => {
    if (
      process.env.CONVEX_CLOUD_URL !==
      "https://curious-greyhound-437.convex.cloud"
    )
      throw new Error(
        "Fixture autorisée uniquement sur le développement désigné.",
      )
    const original = (await ctx.db.get(args.id))!
    const state = await workspace(ctx, args.id)
    const source = await sourceRecord(ctx, args.id, args.handle)
    if (state?.mode !== "active" || !source)
      throw new Error("Source de répétition non disponible.")
    const product = await sourceBody(ctx, source)
    const id = await ctx.db.insert("catalogOperations", {
      ownerId: original.ownerId,
      origin: original.origin,
      type: "export",
      mode: original.mode,
      status: "review",
      phase: "products",
      root: "",
      storageMode: "convex",
      revision: 0,
      generation: 0,
      total: 1,
      done: product.errors.length ? 0 : 1,
      failed: product.errors.length ? 1 : 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rehearsal: true,
    })
    const root = `catalog-rehearsals/${original.ownerId}/${id}`
    await ctx.db.patch(id, { root })
    const op = (await ctx.db.get(id))!
    const prep: Preparation = { ...JSON.parse(state.preparation), revision: 0 }
    await ctx.db.insert("catalogWorkspaces", {
      operationId: id,
      mode: "active",
      activeVersion: 1,
      preparation: JSON.stringify(prep),
      sourceRevision: 0,
      sourceGeneration: 0,
      sourcePreparationKey: "fixture",
      sourceFingerprint: "fixture",
      sourceRoot: root,
      count: 1,
      validated: 1,
      stage: "ready",
      edited: true,
      dataVersion: 0,
    })
    const copied = await writeSource(
      ctx,
      op,
      JSON.stringify(product),
      source.override,
      source.fingerprint,
    )
    await materialize(ctx, op, copied.source, copied.product, prep, 1)
    return id
  },
})

export const migrationFailure = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    version: v.number(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const s = await workspace(ctx, args.id)
    if (s?.mode === "migration" && s.activeVersion === args.version)
      await ctx.db.patch(s._id, { error: args.error.slice(0, 1000) })
    return null
  },
})
