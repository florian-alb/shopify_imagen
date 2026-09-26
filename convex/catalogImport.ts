import { v, ConvexError } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { requireUserId } from "./authz"
import { assertWorkspaceUnlocked } from "./catalogWorkspace"
import { sourceOrigin } from "./catalogImport/model"
import { taskSpec } from "./catalogImport/validators"

export async function ownedOperation(
  ctx: QueryCtx | MutationCtx,
  id: Id<"catalogOperations">,
  owner: Id<"users">,
) {
  const op = await ctx.db.get(id)
  if (!op || op.ownerId !== owner) throw new ConvexError("Export inaccessible.")
  return op
}
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireUserId(ctx)
    return ctx.db
      .query("catalogOperations")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", owner))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
export const get = query({
  args: { id: v.id("catalogOperations") },
  handler: async (ctx, { id }) =>
    ownedOperation(ctx, id, await requireUserId(ctx)),
})
export const activity = query({
  args: {
    id: v.id("catalogOperations"),
    status: v.union(
      v.literal("failed"),
      v.literal("running"),
      v.literal("queued"),
      v.literal("done"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await ownedOperation(ctx, args.id, await requireUserId(ctx))
    return ctx.db
      .query("catalogTasks")
      .withIndex("by_operationId_and_status", (q) =>
        q.eq("operationId", args.id).eq("status", args.status),
      )
      .paginate(args.paginationOpts)
  },
})
export const create = mutation({
  args: { url: v.string(), mode: v.union(v.literal("menu"), v.literal("all")) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx)
    const origin = sourceOrigin(args.url)
    const now = Date.now()
    const id = await ctx.db.insert("catalogOperations", {
      ownerId,
      origin,
      mode: args.mode,
      type: "export",
      storageMode: "convex",
      status: "queued",
      phase: "menu",
      root: "",
      revision: 0,
      total: 0,
      done: 0,
      failed: 0,
      generation: 0,
      createdAt: now,
      updatedAt: now,
    })
    const root = `catalog-exports/${ownerId}/${id}`
    await ctx.db.patch(id, { root })
    await addTask(ctx, id, { key: "menu", kind: "menu", inputKey: "" })
    await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, { id })
    return id
  },
})
async function addTask(
  ctx: MutationCtx,
  id: Id<"catalogOperations">,
  spec: { key: string; kind: Doc<"catalogTasks">["kind"]; inputKey: string },
) {
  const existing = await ctx.db
    .query("catalogTasks")
    .withIndex("by_operationId_and_key", (q) =>
      q.eq("operationId", id).eq("key", spec.key),
    )
    .unique()
  if (existing) return
  await ctx.db.insert("catalogTasks", {
    operationId: id,
    ...spec,
    status: "queued",
    attempts: 0,
    generation: 0,
    nextAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}
export const control = mutation({
  args: {
    id: v.id("catalogOperations"),
    command: v.union(
      v.literal("pause"),
      v.literal("resume"),
      v.literal("cancel"),
      v.literal("retry"),
    ),
    taskId: v.optional(v.id("catalogTasks")),
  },
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, await requireUserId(ctx))
    await assertWorkspaceUnlocked(ctx, op._id)
    if (args.command === "cancel" && op.type === "import" && op.activeTaskId)
      throw new ConvexError(
        "Mettez en pause et attendez la sauvegarde du lot Shopify avant d’arrêter.",
      )
    if (args.command === "pause" || args.command === "cancel") {
      await ctx.db.patch(op._id, {
        status: args.command === "pause" ? "paused" : "cancelled",
        updatedAt: Date.now(),
      })
      return
    }
    if (op.activeTaskId && (op.leaseUntil ?? 0) > Date.now())
      throw new ConvexError(
        "Le traitement termine son point de sauvegarde. Réessayez dans quelques instants.",
      )
    if (args.command === "retry") {
      const tasks = args.taskId
        ? [await ctx.db.get(args.taskId)]
        : await ctx.db
            .query("catalogTasks")
            .withIndex("by_operationId_and_status", (q) =>
              q.eq("operationId", op._id).eq("status", "failed"),
            )
            .take(100)
      for (const task of tasks) {
        if (!task || task.operationId !== op._id || task.status !== "failed")
          continue
        await ctx.db.patch(task._id, {
          status: "queued",
          attempts: 0,
          nextAt: 0,
          error: undefined,
        })
      }
    }
    if (op.activeTaskId) {
      await ctx.db.patch(op.activeTaskId, { status: "queued", nextAt: 0 })
    }
    await ctx.db.patch(op._id, {
      status: "queued",
      generation: op.generation + 1,
      activeTaskId: undefined,
      leaseUntil: undefined,
      error: undefined,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, {
      id: op._id,
    })
  },
})
export const context = internalQuery({
  args: { id: v.id("catalogOperations"), owner: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (!op || (args.owner && op.ownerId !== args.owner))
      throw new ConvexError("Opération inaccessible.")
    return op
  },
})
export const importShop = internalQuery({
  args: { shopId: v.id("shops"), owner: v.id("users") },
  handler: async (ctx, args) => {
    const shop = await ctx.db.get(args.shopId)
    if (!shop || shop.createdByUserId !== args.owner)
      throw new ConvexError("Boutique inaccessible.")
    return shop
  },
})
export const createImport = internalMutation({
  args: {
    exportId: v.id("catalogOperations"),
    owner: v.id("users"),
    shopId: v.id("shops"),
    collectionKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const source = await ownedOperation(ctx, args.exportId, args.owner)
    const shop = await ctx.db.get(args.shopId)
    if (
      !shop ||
      shop.createdByUserId !== args.owner ||
      !source.finalKey ||
      source.type !== "export" ||
      source.activeTaskId ||
      (source.editUntil ?? 0) > Date.now()
    )
      throw new ConvexError("Import non autorisé.")
    if (args.collectionKeys.length > 5000)
      throw new ConvexError("Trop de collections.")
    for (const status of [
      "queued",
      "running",
      "paused",
      "interrupted",
    ] as const) {
      const active = await ctx.db
        .query("catalogOperations")
        .withIndex("by_shopId_and_status", (q) =>
          q.eq("shopId", args.shopId).eq("status", status),
        )
        .first()
      if (active)
        throw new ConvexError(
          "Un import est déjà ouvert pour cette boutique. Terminez-le ou arrêtez-le avant d’en lancer un autre.",
        )
    }
    const now = Date.now()
    const id = await ctx.db.insert("catalogOperations", {
      ownerId: args.owner,
      origin: source.origin,
      mode: source.mode,
      type: "import",
      sourceExportId: source._id,
      shopId: shop._id,
      selection: args.collectionKeys,
      preparationKey: `${source.root}/final/${source.revision}/preparation.json`,
      sourceSnapshot: `${source.root}/final/${source.revision}`,
      revision: source.revision,
      root: "",
      status: "queued",
      phase: "importSetup",
      total: source.total,
      done: 0,
      failed: 0,
      generation: 0,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(id, {
      root: `catalog-exports/${args.owner}/${source._id}/imports/${shop._id}/${id}`,
    })
    await addTask(ctx, id, {
      key: "import-setup",
      kind: "importSetup",
      inputKey: "",
    })
    await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, { id })
    return id
  },
})
export const claim = internalMutation({
  args: { id: v.id("catalogOperations") },
  handler: async (ctx, { id }) => {
    const op = await ctx.db.get(id)
    const now = Date.now()
    if (!op || !["queued", "running"].includes(op.status)) return null
    await assertWorkspaceUnlocked(ctx, id)
    if (op.activeTaskId && (op.leaseUntil ?? 0) > now) return null
    const lockDomain = op.shopId ? `shop:${op.shopId}` : op.origin
    const domain = await ctx.db
      .query("catalogDomainLeases")
      .withIndex("by_domain", (q) => q.eq("domain", lockDomain))
      .unique()
    if (domain && domain.operationId !== id && domain.expiresAt > now) {
      await ctx.scheduler.runAfter(10_000, internal.catalogImportActions.work, {
        id,
      })
      return null
    }
    if (op.activeTaskId)
      await ctx.db.patch(op.activeTaskId, { status: "queued" })
    const tasks = await ctx.db
      .query("catalogTasks")
      .withIndex("by_operationId_and_status", (q) =>
        q.eq("operationId", id).eq("status", "queued"),
      )
      .take(100)
    const task = tasks.find((t) => t.nextAt <= now)
    if (!task) {
      if (tasks.length)
        await ctx.scheduler.runAfter(
          Math.max(1000, Math.min(...tasks.map((t) => t.nextAt)) - now),
          internal.catalogImportActions.work,
          { id },
        )
      else {
        const failed = await ctx.db
          .query("catalogTasks")
          .withIndex("by_operationId_and_status", (q) =>
            q.eq("operationId", id).eq("status", "failed"),
          )
          .first()
        await ctx.db.patch(id, {
          status:
            failed || op.failed > 0
              ? "partial"
              : op.type === "import"
                ? "completed"
                : "review",
          activeTaskId: undefined,
          leaseUntil: undefined,
          updatedAt: now,
        })
      }
      return null
    }
    const generation = op.generation + 1
    const leaseUntil = now + 15 * 60_000
    await ctx.db.patch(id, {
      activeTaskId: task._id,
      generation,
      leaseUntil,
      status: "running",
      phase: task.kind,
      updatedAt: now,
    })
    await ctx.db.patch(task._id, {
      status: "running",
      generation,
      attempts: task.attempts + 1,
      updatedAt: now,
    })
    const lease = {
      domain: lockDomain,
      operationId: id,
      generation,
      expiresAt: leaseUntil,
    }
    if (domain) await ctx.db.replace(domain._id, lease)
    else await ctx.db.insert("catalogDomainLeases", lease)
    return {
      op: { ...op, generation },
      task: { ...task, generation, attempts: task.attempts + 1 },
    }
  },
})
export const settle = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    taskId: v.id("catalogTasks"),
    generation: v.number(),
    resultKey: v.string(),
    tasks: v.array(taskSpec),
    complete: v.boolean(),
    inputKey: v.optional(v.string()),
    preparationKey: v.optional(v.string()),
    total: v.optional(v.number()),
    done: v.optional(v.number()),
    failed: v.optional(v.number()),
    finalKey: v.optional(v.string()),
    selecting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    const task = await ctx.db.get(args.taskId)
    if (
      !op ||
      !task ||
      op.activeTaskId !== task._id ||
      op.generation !== args.generation ||
      task.generation !== args.generation ||
      task.status !== "running"
    )
      return false
    await ctx.db.patch(task._id, {
      status: args.complete ? "done" : "queued",
      inputKey: args.inputKey ?? task.inputKey,
      resultKey: args.resultKey,
      updatedAt: Date.now(),
      attempts: 0,
    })
    for (const spec of args.tasks) await addTask(ctx, op._id, spec)
    if (args.complete && ["collection", "sitemap"].includes(task.kind)) {
      const remaining = await ctx.db
        .query("catalogTasks")
        .withIndex("by_operationId_and_status", (q) =>
          q.eq("operationId", op._id).eq("status", "queued"),
        )
        .first()
      const failure = await ctx.db
        .query("catalogTasks")
        .withIndex("by_operationId_and_status", (q) =>
          q.eq("operationId", op._id).eq("status", "failed"),
        )
        .first()
      if (!remaining && !failure)
        await addTask(ctx, op._id, {
          key: "index-0",
          kind: "index",
          inputKey: "",
        })
    }
    const stopped = op.status === "paused" || op.status === "cancelled"
    await ctx.db.patch(op._id, {
      activeTaskId: undefined,
      leaseUntil: undefined,
      status: stopped
        ? op.status
        : args.selecting
          ? "selecting"
          : args.finalKey
            ? op.failed
              ? "partial"
              : "completed"
            : "queued",
      ...(args.preparationKey ? { preparationKey: args.preparationKey } : {}),
      ...(args.total !== undefined ? { total: args.total } : {}),
      ...(args.done !== undefined ? { done: op.done + args.done } : {}),
      ...(args.failed !== undefined ? { failed: op.failed + args.failed } : {}),
      ...(args.finalKey
        ? { finalKey: args.finalKey, snapshotRevision: undefined }
        : {}),
      updatedAt: Date.now(),
      error: undefined,
    })
    const lease = await ctx.db
      .query("catalogDomainLeases")
      .withIndex("by_domain", (q) =>
        q.eq("domain", op.shopId ? `shop:${op.shopId}` : op.origin),
      )
      .unique()
    if (lease?.operationId === op._id && lease.generation === args.generation)
      await ctx.db.patch(lease._id, { expiresAt: 0 })
    if (!stopped && !args.selecting && !args.finalKey)
      await ctx.scheduler.runAfter(
        op.type === "import" && !args.complete ? 10_000 : 1000,
        internal.catalogImportActions.work,
        { id: op._id },
      )
    return true
  },
})
export const fail = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    taskId: v.id("catalogTasks"),
    generation: v.number(),
    error: v.string(),
    retryMs: v.optional(v.number()),
    blocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    const task = await ctx.db.get(args.taskId)
    if (
      !op ||
      !task ||
      op.activeTaskId !== args.taskId ||
      op.generation !== args.generation
    )
      return
    const retry = !args.blocked && task.attempts < 4
    const nextAt =
      Date.now() + Math.max(args.retryMs ?? 0, 2000 * 2 ** task.attempts)
    await ctx.db.patch(task._id, {
      status: retry ? "queued" : "failed",
      error: args.error.slice(0, 2000),
      nextAt,
      updatedAt: Date.now(),
    })
    const stopped = ["paused", "cancelled"].includes(op.status)
    await ctx.db.patch(op._id, {
      status: stopped ? op.status : args.blocked ? "interrupted" : "queued",
      activeTaskId: undefined,
      leaseUntil: undefined,
      error: args.error.slice(0, 2000),
      updatedAt: Date.now(),
    })
    const lease = await ctx.db
      .query("catalogDomainLeases")
      .withIndex("by_domain", (q) =>
        q.eq("domain", op.shopId ? `shop:${op.shopId}` : op.origin),
      )
      .unique()
    if (lease?.operationId === op._id)
      await ctx.db.patch(lease._id, { expiresAt: 0 })
    if (!stopped && !args.blocked)
      await ctx.scheduler.runAfter(
        retry ? nextAt - Date.now() : 1000,
        internal.catalogImportActions.work,
        { id: op._id },
      )
  },
})
export const editLock = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    revision: v.number(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    await assertWorkspaceUnlocked(ctx, op._id)
    if (op.storageMode === "convex")
      throw new Error("Utilisez les éditions du catalogue Convex.")
    if (op.type !== "export" || op.activeTaskId)
      throw new ConvexError(
        "Cette opération ne peut pas être modifiée maintenant.",
      )
    if (op.revision !== args.revision || (op.editUntil ?? 0) > Date.now())
      throw new ConvexError(
        "Ce catalogue a changé. Rechargez avant d’enregistrer.",
      )
    if (["queued", "running"].includes(op.status))
      throw new ConvexError(
        "Attendez la fin de la phase en cours avant de modifier la préparation.",
      )
    await ctx.db.patch(op._id, {
      editToken: args.token,
      editUntil: Date.now() + 120_000,
    })
    return op
  },
})
export const savePreparation = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    token: v.string(),
    key: v.string(),
    tasks: v.array(taskSpec),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (!op || op.editToken !== args.token || (op.editUntil ?? 0) < Date.now())
      throw new ConvexError(
        "L’enregistrement a expiré. Rechargez le catalogue.",
      )
    for (const task of args.tasks) await addTask(ctx, op._id, task)
    await ctx.db.patch(op._id, {
      preparationKey: args.key,
      revision: op.revision + 1,
      editToken: undefined,
      editUntil: undefined,
      finalKey: undefined,
      status: args.tasks.length
        ? "queued"
        : op.status === "completed"
          ? "review"
          : op.status,
      updatedAt: Date.now(),
    })
    if (args.tasks.length)
      await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, {
        id: op._id,
      })
  },
})
export const enqueue = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    tasks: v.array(taskSpec),
    phase: v.string(),
  },
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    await assertWorkspaceUnlocked(ctx, op._id)
    if (op.type !== "export")
      throw new ConvexError("Action réservée aux exports.")
    if ((op.editUntil ?? 0) > Date.now())
      throw new ConvexError("Une sauvegarde est en cours.")
    if (op.activeTaskId || ["running", "queued"].includes(op.status))
      throw new ConvexError("Une opération est déjà en cours.")
    if (op.snapshotRevision !== undefined)
      throw new Error(
        "Reprenez le snapshot en cours avant de lancer une autre opération.",
      )
    for (const task of args.tasks) await addTask(ctx, op._id, task)
    await ctx.db.patch(op._id, {
      status: "queued",
      phase: args.phase,
      snapshotRevision:
        args.phase === "assemble" ? op.revision + 1 : op.snapshotRevision,
      finalKey: undefined,
      revision: op.revision + 1,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, {
      id: op._id,
    })
  },
})
export const resumeStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const status of ["running", "queued"] as const) {
      const stale = await ctx.db
        .query("catalogOperations")
        .withIndex("by_status_and_updatedAt", (q) =>
          q.eq("status", status).lt("updatedAt", Date.now() - 16 * 60_000),
        )
        .take(20)
      for (const op of stale)
        await ctx.scheduler.runAfter(0, internal.catalogImportActions.work, {
          id: op._id,
        })
    }
  },
})

export const destinationShops = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireUserId(ctx)
    return (
      await ctx.db
        .query("shops")
        .withIndex("by_created_by_user", (q) => q.eq("createdByUserId", owner))
        .take(100)
    ).map((s) => ({ _id: s._id, name: s.name ?? s.domain, domain: s.domain }))
  },
})
export const releaseEdit = internalMutation({
  args: { id: v.id("catalogOperations"), token: v.string() },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (op?.editToken === args.token)
      await ctx.db.patch(op._id, { editToken: undefined, editUntil: undefined })
  },
})
// Track a conservative estimate before each call, without enforcing a spending cap.
export const reserveAi = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    owner: v.id("users"),
    tokens: v.number(),
  },
  handler: async (ctx, args) => {
    const op = await ownedOperation(ctx, args.id, args.owner)
    await ctx.db.patch(op._id, { aiUsed: (op.aiUsed ?? 0) + args.tokens })
  },
})
export const reconcileAi = internalMutation({
  args: {
    id: v.id("catalogOperations"),
    reserved: v.number(),
    used: v.number(),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.id)
    if (op)
      await ctx.db.patch(op._id, {
        aiUsed: Math.max(0, (op.aiUsed ?? 0) - args.reserved + args.used),
      })
  },
})
