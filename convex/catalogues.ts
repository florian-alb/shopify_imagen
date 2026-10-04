import { v } from "convex/values"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireUserId } from "./authz"
import { sourceOrigin } from "./catalogue/source"
import {
  decode,
  encode,
  effective,
  emptyStructure,
  guardSize,
  validateTags,
  type Structure,
  type Work,
  type CatalogProduct,
  type ProductOverride,
} from "./catalogue/model"

type Ctx = QueryCtx | MutationCtx
async function owned(ctx: Ctx, id: Id<"catalogues">) {
  const owner = await requireUserId(ctx),
    c = await ctx.db.get(id)
  if (!c || c.ownerId !== owner) throw new Error("Catalogue inaccessible.")
  return c
}
function unlocked(c: Doc<"catalogues">) {
  if (
    c.work &&
    (c.status === "working" || decode<Work>(c.work).kind === "import")
  )
    throw new Error(
      "Attendez la fin de l’opération ou relancez son étape en échec.",
    )
}
function partial(c: Doc<"catalogues">, accepted: boolean) {
  const s = decode<Structure>(c.structure)
  if (
    (c.failed ||
      c.complete < c.total ||
      s.warnings.length ||
      s.collections.some((x) => x.membership !== "complete")) &&
    !accepted
  )
    throw new Error("Confirmez l’utilisation de ce catalogue incomplet.")
}
async function launch(ctx: MutationCtx, c: Doc<"catalogues">, work: Work) {
  const generation = c.generation + 1
  await ctx.db.patch(c._id, {
    work: encode(work),
    phase: work.phase,
    status: "working",
    generation,
    error: undefined,
    lease: undefined,
    leaseUntil: undefined,
    updatedAt: Date.now(),
    ...(c.status === "blocked" &&
    c.work &&
    decode<Work>(c.work).kind !== work.kind
      ? { resumeWork: c.work }
      : {}),
  })
  await ctx.scheduler.runAfter(0, internal.catalogueActions.work, {
    id: c._id,
    generation,
  })
}
export const create = mutation({
  args: {
    url: v.string(),
    mode: v.union(v.literal("ALL"), v.literal("TOP_N")),
    topN: v.optional(v.number()),
  },
  returns: v.id("catalogues"),
  handler: async (ctx, args) => {
    if (
      args.mode === "TOP_N" &&
      (!Number.isSafeInteger(args.topN) || args.topN! < 1)
    )
      throw new Error("N doit être un entier strictement positif.")
    const ownerId = await requireUserId(ctx),
      origin = sourceOrigin(args.url),
      now = Date.now()
    const id = await ctx.db.insert("catalogues", {
      ownerId,
      origin,
      mode: args.mode,
      ...(args.mode === "TOP_N" ? { topN: args.topN } : {}),
      status: "working",
      phase: "menu",
      structure: encode(emptyStructure()),
      work: encode({ kind: "discover", phase: "menu" }),
      generation: 1,
      version: 0,
      total: 0,
      complete: 0,
      failed: 0,
      sourceCount: 0,
      initialCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.catalogueActions.work, {
      id,
      generation: 1,
    })
    return id
  },
})
export const list = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const owner = await requireUserId(ctx)
    const rows = await ctx.db
      .query("catalogues")
      .withIndex("by_owner", (q) => q.eq("ownerId", owner))
      .order("desc")
      .take(50)
    return encode(
      rows.map((c) => ({
        id: c._id,
        origin: c.origin,
        mode: c.mode,
        topN: c.topN,
        status: c.status,
        total: c.total,
        complete: c.complete,
        updatedAt: c.updatedAt,
      })),
    )
  },
})
export const get = query({
  args: { id: v.id("catalogues") },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const c = await owned(ctx, id)
    return encode({
      ...c,
      structure: decode(c.structure),
      work: c.work ? decode(c.work) : null,
      lastImport: c.lastImport ? decode(c.lastImport) : null,
    })
  },
})
export const products = query({
  args: {
    id: v.id("catalogues"),
    paginationOpts: paginationOptsValidator,
    search: v.string(),
    collection: v.string(),
    state: v.string(),
    sort: v.union(v.literal("rank"), v.literal("title"), v.literal("state")),
  },
  returns: paginationResultValidator(v.string()),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    const index =
      a.sort === "title"
        ? "by_catalogue_title"
        : a.sort === "state"
          ? "by_catalogue_state"
          : "by_catalogue_rank"
    const page = await ctx.db
      .query("produits")
      .withIndex(index, (q) => q.eq("catalogueId", a.id).eq("selected", true))
      .paginate({
        ...a.paginationOpts,
        numItems: Math.min(a.paginationOpts.numItems, 50),
        maximumRowsRead: 50,
        maximumBytesRead: 2_000_000,
      })
    const structure = decode<Structure>(c.structure)
    // Keep Convex cursor/split metadata so the client can continue sparse filtered
    // batches without treating each storage batch as a complete display page.
    return {
      ...page,
      page: page.page
        .filter(
          (p) =>
            (!a.search || p.titleLower.includes(a.search.toLowerCase())) &&
            (!a.state || p.state === a.state) &&
            (!a.collection ||
              (a.collection === "__none"
                ? !p.collections.length
                : p.collections.includes(a.collection))),
        )
        .map((p) => {
          const data = p.data ? decode<CatalogProduct>(p.data) : null
          const override = decode<ProductOverride>(p.override ?? "{}")
          return encode({
            id: p._id,
            handle: p.handle,
            title: p.title,
            rank: p.rank === Number.MAX_SAFE_INTEGER ? null : p.rank,
            collections: p.collections,
            state: p.state,
            error: p.error,
            image: data?.images[0]?.url,
            tags: data
              ? effective(
                  { ...data, collections: p.collections },
                  structure,
                  override,
                ).tags
              : [],
            remote: p.remote ? decode(p.remote) : null,
          })
        }),
    }
  },
})
export const product = query({
  args: { id: v.id("catalogues"), productId: v.id("produits") },
  returns: v.string(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id),
      p = await ctx.db.get(a.productId)
    if (!p || p.catalogueId !== c._id || !p.selected)
      throw new Error("Produit inaccessible.")
    return encode({
      ...p,
      data: p.data
        ? effective(
            { ...decode<CatalogProduct>(p.data), collections: p.collections },
            decode<Structure>(c.structure),
            decode<ProductOverride>(p.override ?? "{}"),
          )
        : null,
      sourceDefaults: p.data
        ? {
            title: decode<CatalogProduct>(p.data).title,
            tags: effective(
              { ...decode<CatalogProduct>(p.data), collections: p.collections },
              decode<Structure>(c.structure),
            ).tags,
          }
        : null,
      override: decode(p.override ?? "{}"),
      remote: p.remote ? decode(p.remote) : null,
    })
  },
})
export const saveProduct = mutation({
  args: {
    id: v.id("catalogues"),
    productId: v.id("produits"),
    version: v.number(),
    override: v.object({
      title: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      excluded: v.optional(v.boolean()),
      reviewed: v.optional(v.boolean()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    unlocked(c)
    if (a.version !== c.version)
      throw new Error(
        "Le catalogue a changé. Relisez la fiche avant d’enregistrer.",
      )
    const p = await ctx.db.get(a.productId)
    if (!p || p.catalogueId !== c._id || !p.data)
      throw new Error("Fiche inaccessible.")
    if (
      a.override.title !== undefined &&
      (!a.override.title.trim() || a.override.title.length > 1000)
    )
      throw new Error("Titre invalide.")
    if (
      a.override.tags?.some((t) => !t.trim() || t.length > 100) ||
      (a.override.tags?.length ?? 0) > 250
    )
      throw new Error("Tags invalides.")
    const title = a.override.title ?? decode<CatalogProduct>(p.data).title
    guardSize({
      ...p,
      override: encode(a.override),
      title,
      titleLower: title.toLowerCase(),
    })
    await ctx.db.patch(p._id, {
      override: encode(a.override),
      title,
      titleLower: title.toLowerCase(),
    })
    await ctx.db.patch(c._id, {
      version: c.version + 1,
      updatedAt: Date.now(),
    })
    return null
  },
})
export const saveTags = mutation({
  args: {
    id: v.id("catalogues"),
    version: v.number(),
    values: v.array(v.object({ key: v.string(), tag: v.string() })),
    validate: v.boolean(),
    collect: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    unlocked(c)
    if (a.version !== c.version)
      throw new Error("Le catalogue a changé. Rechargez les tags.")
    const s = decode<Structure>(c.structure)
    for (const value of a.values) {
      const col = s.collections.find((x) => x.key === value.key)
      if (!col) throw new Error("Collection inconnue.")
      if (col.tag !== value.tag.trim()) {
        col.tag = value.tag.trim()
        col.validated = false
        col.edited = true
      }
    }
    if (a.validate) {
      validateTags(s.collections)
      for (const value of a.values)
        s.collections.find((x) => x.key === value.key)!.validated = true
    }
    if (a.collect && s.collections.some((x) => !x.validated))
      throw new Error("Validez tous les tags avant la collecte.")
    guardSize({ ...c, structure: encode(s) })
    await ctx.db.patch(c._id, {
      structure: encode(s),
      version: c.version + 1,
      updatedAt: Date.now(),
    })
    if (a.collect)
      await launch(ctx, c, {
        kind: "collect",
        phase: "collect",
        collection: 0,
      })
    return null
  },
})
export const retry = mutation({
  args: { id: v.id("catalogues") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const c = await owned(ctx, id)
    if (c.status === "working")
      throw new Error("Une opération est déjà en cours.")
    const work =
      c.work || c.resumeWork
        ? decode<Work>((c.work ?? c.resumeWork)!)
        : { kind: "collect" as const, phase: "retry" }
    await ctx.db.patch(c._id, { resumeWork: undefined })
    work.attempts = 0
    work.retryAt = undefined
    await launch(ctx, c, work)
    return null
  },
})
export const addCollection = mutation({
  args: { id: v.id("catalogues"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    unlocked(c)
    const s = decode<Structure>(c.structure),
      index = s.collections.findIndex((x) => x.key === a.key)
    if (index < 0 || s.collections.some((x) => !x.validated))
      throw new Error("Validez les tags avant d’ajouter des produits.")
    await launch(ctx, c, {
      kind: "add",
      phase: "members",
      collection: index,
      addition: a.key,
      url: s.collections[index].url + "?sort_by=best-selling",
    })
    return null
  },
})
export const exportJson = mutation({
  args: { id: v.id("catalogues"), allowPartial: v.boolean() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    unlocked(c)
    partial(c, a.allowPartial)
    await launch(ctx, c, {
      kind: "export",
      phase: "export",
      allowPartial: a.allowPartial,
    })
    return null
  },
})
export const destinationShops = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const owner = await requireUserId(ctx)
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_created_by_user", (q) => q.eq("createdByUserId", owner))
      .take(100)
    return encode(
      shops.map((s) => ({ id: s._id, name: s.name, domain: s.domain })),
    )
  },
})
export const startImport = mutation({
  args: {
    id: v.id("catalogues"),
    shopId: v.id("shops"),
    allowPartial: v.boolean(),
    version: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await owned(ctx, a.id)
    unlocked(c)
    partial(c, a.allowPartial)
    if (c.version !== a.version)
      throw new Error("Le catalogue a changé. Préparez à nouveau l’import.")
    const s = decode<Structure>(c.structure)
    validateTags(s.collections)
    if (s.collections.some((x) => !x.validated))
      throw new Error("Les tags doivent être validés.")
    const shop = await ctx.db.get(a.shopId)
    if (!shop || shop.createdByUserId !== c.ownerId)
      throw new Error("Boutique inaccessible.")
    for (const status of ["working", "blocked"] as const) {
      const active = await ctx.db
        .query("catalogues")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(100)
      if (active.length === 100)
        throw new Error(
          "Trop d’opérations à vérifier ; terminez les opérations ouvertes.",
        )
      if (
        active.some((x) => x.work && decode<Work>(x.work).shopId === a.shopId)
      )
        throw new Error(
          "Un import est déjà en cours ou attend une réconciliation vers cette boutique.",
        )
    }
    await launch(ctx, c, {
      kind: "import",
      phase: "setup",
      shopId: a.shopId,
      importVersion: c.version,
      allowPartial: a.allowPartial,
      mappings: {},
    })
    return null
  },
})

export const context = internalQuery({
  args: { id: v.id("catalogues") },
  returns: v.any(),
  handler: (ctx, a) => ctx.db.get(a.id),
})
export const shop = internalQuery({
  args: { id: v.id("shops"), owner: v.id("users") },
  returns: v.any(),
  handler: async (ctx, a) => {
    const s = await ctx.db.get(a.id)
    if (!s || s.createdByUserId !== a.owner)
      throw new Error("Boutique inaccessible.")
    return s
  },
})
const fenceArgs = {
  id: v.id("catalogues"),
  generation: v.number(),
  token: v.string(),
}
async function fenced(
  ctx: MutationCtx,
  a: { id: Id<"catalogues">; generation: number; token: string },
) {
  const c = await ctx.db.get(a.id)
  if (!c || c.generation !== a.generation || c.lease !== a.token || !c.work)
    throw new Error("Action périmée.")
  return c
}
export const claim = internalMutation({
  args: fenceArgs,
  returns: v.any(),
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.id)
    if (
      !c ||
      c.generation !== a.generation ||
      c.status !== "working" ||
      !c.work ||
      (c.leaseUntil ?? 0) > Date.now()
    )
      return null
    const retryAt = decode<Work>(c.work).retryAt
    if (retryAt && retryAt > Date.now()) {
      await ctx.scheduler.runAfter(
        retryAt - Date.now(),
        internal.catalogueActions.work,
        { id: a.id, generation: a.generation },
      )
      return null
    }
    const siblings = await ctx.db
      .query("catalogues")
      .withIndex("by_origin_status", (q) =>
        q.eq("origin", c.origin).eq("status", "working"),
      )
      .take(100)
    if (
      siblings.some((x) => x._id !== c._id && (x.leaseUntil ?? 0) > Date.now())
    ) {
      await ctx.scheduler.runAfter(15_000, internal.catalogueActions.work, {
        id: a.id,
        generation: a.generation,
      })
      return null
    }
    await ctx.db.patch(a.id, {
      lease: a.token,
      leaseUntil: Date.now() + 180_000,
    })
    return c
  },
})
export const checkpoint = internalMutation({
  args: {
    ...fenceArgs,
    work: v.optional(v.string()),
    structure: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("working"),
        v.literal("tags"),
        v.literal("ready"),
        v.literal("partial"),
        v.literal("blocked"),
      ),
    ),
    error: v.optional(v.string()),
    delay: v.optional(v.number()),
    exportKey: v.optional(v.string()),
    lastImport: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a),
      s = decode<Structure>(a.structure ?? c.structure)
    const version = c.version + Number(encode(s) !== c.structure)
    const patch = {
      work: a.work,
      phase: a.work
        ? decode<Work>(a.work).phase
        : a.status === "tags"
          ? "tags"
          : "ready",
      structure: encode(s),
      status:
        a.status ??
        (a.work
          ? "working"
          : c.failed ||
              c.complete < c.total ||
              s.warnings.length ||
              s.collections.some((x) => x.membership !== "complete")
            ? "partial"
            : "ready"),
      error: a.error,
      lease: undefined,
      leaseUntil: undefined,
      version,
      updatedAt: Date.now(),
      ...(a.exportKey
        ? { exportKey: a.exportKey, exportVersion: version }
        : {}),
      ...(a.lastImport ? { lastImport: a.lastImport } : {}),
      ...(a.status === "tags"
        ? { initialCount: c.total, rankedAt: Date.now() }
        : {}),
    }
    guardSize({ ...c, ...patch })
    await ctx.db.patch(c._id, patch)
    if (a.work && patch.status === "working")
      await ctx.scheduler.runAfter(
        a.delay ?? 0,
        internal.catalogueActions.work,
        { id: a.id, generation: a.generation },
      )
    return null
  },
})
export const links = internalMutation({
  args: {
    ...fenceArgs,
    links: v.array(
      v.object({
        handle: v.string(),
        url: v.string(),
        collection: v.optional(v.string()),
        selected: v.boolean(),
        rank: v.optional(v.number()),
        sitemap: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a)
    let total = c.total,
      sourceCount = c.sourceCount
    const s = decode<Structure>(c.structure)
    for (const link of a.links) {
      let p = await ctx.db
        .query("produits")
        .withIndex("by_catalogue_handle", (q) =>
          q.eq("catalogueId", c._id).eq("handle", link.handle),
        )
        .unique()
      if (p?.aliasOf) p = await ctx.db.get(p.aliasOf)
      const memberships = [
        ...new Set([
          ...(p?.collections ?? []),
          ...(link.collection ? [link.collection] : []),
        ]),
      ].sort()
      const selected = !!p?.selected || link.selected
      if (selected && !p?.selected) total++
      if (!p) {
        sourceCount++
        if (
          link.collection &&
          !s.warnings.includes(
            "Des produits de collections sont absents du sitemap et peuvent avoir un rang inconnu.",
          )
        )
          s.warnings.push(
            "Des produits de collections sont absents du sitemap et peuvent avoir un rang inconnu.",
          )
      }
      if (link.collection && !p?.collections.includes(link.collection)) {
        const col = s.collections.find((x) => x.key === link.collection)
        if (col) col.count++
      }
      if (selected)
        for (const key of memberships) {
          if (!p?.selected || !p.collections.includes(key)) {
            const col = s.collections.find((x) => x.key === key)
            if (col) col.selectedCount++
          }
        }
      const fields = {
        collections: memberships,
        group: memberships[0] ?? "~none",
        selected,
        rank: Math.min(
          p?.rank ?? Number.MAX_SAFE_INTEGER,
          link.rank ?? Number.MAX_SAFE_INTEGER,
        ),
        inSitemap: !!p?.inSitemap || !!link.sitemap,
      }
      if (p) await ctx.db.patch(p._id, fields)
      else
        await ctx.db.insert("produits", {
          catalogueId: c._id,
          identity: `url:${link.handle}`,
          handle: link.handle,
          url: link.url,
          title: link.handle,
          titleLower: link.handle.toLowerCase(),
          state: "pending",
          attempts: 0,
          ...fields,
        })
    }
    guardSize({ ...c, structure: encode(s) })
    await ctx.db.patch(c._id, {
      total,
      sourceCount,
      structure: encode(s),
      version: c.version + 1,
      leaseUntil: Date.now() + 180_000,
    })
    return null
  },
})
export const page = internalQuery({
  args: {
    id: v.id("catalogues"),
    cursor: v.optional(v.string()),
    selected: v.boolean(),
    group: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, a) => {
    const q =
      a.group !== undefined
        ? ctx.db
            .query("produits")
            .withIndex("by_catalogue_group", (q) =>
              q
                .eq("catalogueId", a.id)
                .eq("selected", a.selected)
                .eq("group", a.group!),
            )
        : ctx.db
            .query("produits")
            .withIndex("by_catalogue_group", (q) =>
              q.eq("catalogueId", a.id).eq("selected", a.selected),
            )
    return q.paginate({
      cursor: a.cursor ?? null,
      numItems: Math.min(20, a.limit ?? 20),
      maximumBytesRead: 2_000_000,
    })
  },
})
export const byId = internalQuery({
  args: { id: v.id("produits") },
  returns: v.any(),
  handler: (ctx, a) => ctx.db.get(a.id),
})
export const targetHandle = internalQuery({
  args: { id: v.id("catalogues"), handle: v.string(), shopId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, a) => {
    let p = await ctx.db
      .query("produits")
      .withIndex("by_catalogue_handle", (q) =>
        q.eq("catalogueId", a.id).eq("handle", a.handle),
      )
      .unique()
    if (p?.aliasOf) p = await ctx.db.get(p.aliasOf)
    const r = p?.remote
      ? decode<import("./catalogue/model").RemoteResult>(p.remote)
      : null
    return r?.shopId === a.shopId && r.status === "complete"
      ? (r.handle ?? null)
      : null
  },
})
export const result = internalMutation({
  args: {
    ...fenceArgs,
    productId: v.id("produits"),
    data: v.optional(v.string()),
    jsonSource: v.optional(v.string()),
    identity: v.optional(v.string()),
    error: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    remote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a),
      p = await ctx.db.get(a.productId)
    if (!p || p.catalogueId !== c._id) throw new Error("Produit inaccessible.")
    if (p.aliasOf) return null // A replay must not merge the same alias twice.
    const data = a.data ? decode<CatalogProduct>(a.data) : null
    const override = decode<ProductOverride>(p.override ?? "{}")
    const title = override.title ?? data?.title ?? p.title
    const patch = {
      ...(a.data ? { data: a.data } : {}),
      ...(a.jsonSource ? { jsonSource: a.jsonSource } : {}),
      ...(a.identity ? { identity: a.identity } : {}),
      ...(a.remote ? { remote: a.remote } : {}),
      title,
      titleLower: title.toLowerCase(),
      state: a.state,
      attempts: a.attempts,
      error: a.error,
    }
    try {
      guardSize({ ...p, ...patch })
    } catch (e) {
      patch.state = "failed"
      patch.error = (e as Error).message
      delete patch.data
      delete patch.jsonSource
    }
    if (a.identity) {
      const previous = await ctx.db
        .query("produits")
        .withIndex("by_catalogue_identity", (q) =>
          q.eq("catalogueId", c._id).eq("identity", a.identity!),
        )
        .unique()
      if (previous && previous._id !== p._id) {
        if (previous.override && p.override && previous.override !== p.override)
          throw new Error("Identité ambiguë : corrections divergentes.")
        const memberships = [
          ...new Set([...previous.collections, ...p.collections]),
        ].sort()
        const winner =
          previous.state === "complete" ? previous : { ...previous, ...patch }
        await ctx.db.patch(previous._id, {
          ...patch,
          data: winner.data,
          jsonSource: winner.jsonSource,
          state: winner.state,
          title: winner.title,
          titleLower: winner.titleLower,
          error: winner.error,
          collections: memberships,
          group: memberships[0] ?? "~none",
          selected: previous.selected || p.selected,
          override: previous.override ?? p.override,
          rank: Math.min(
            previous.rank ?? Number.MAX_SAFE_INTEGER,
            p.rank ?? Number.MAX_SAFE_INTEGER,
          ),
        })
        await ctx.db.patch(p._id, {
          aliasOf: previous._id,
          rank: undefined,
          selected: false,
          state: "complete",
          data: undefined,
          jsonSource: undefined,
          override: undefined,
          identity: `alias:${p.handle}`,
          collections: [],
        })
        const structure = decode<Structure>(c.structure)
        for (const col of structure.collections) {
          const before =
            Number(previous.collections.includes(col.key)) +
            Number(p.collections.includes(col.key))
          const after = Number(memberships.includes(col.key))
          col.count += after - before
          col.selectedCount +=
            Number(
              (previous.selected || p.selected) &&
                memberships.includes(col.key),
            ) -
            Number(
              previous.selected && previous.collections.includes(col.key),
            ) -
            Number(p.selected && p.collections.includes(col.key))
        }
        await ctx.db.patch(c._id, {
          total: c.total - (previous.selected && p.selected ? 1 : 0),
          sourceCount: c.sourceCount - 1,
          structure: encode(structure),
          complete:
            c.complete -
            Number(p.selected && p.state === "complete") -
            Number(previous.selected && previous.state === "complete") +
            Number(
              (p.selected || previous.selected) && winner.state === "complete",
            ),
          failed:
            c.failed -
            Number(p.selected && p.state === "failed") -
            Number(previous.selected && previous.state === "failed") +
            Number(
              (p.selected || previous.selected) && winner.state === "failed",
            ),
          version: c.version + 1,
        })
        return null
      }
    }
    await ctx.db.patch(p._id, patch)
    await ctx.db.patch(c._id, {
      complete:
        c.complete +
        Number(p.selected && patch.state === "complete") -
        Number(p.selected && p.state === "complete"),
      failed:
        c.failed +
        Number(p.selected && patch.state === "failed") -
        Number(p.selected && p.state === "failed"),
      version:
        c.version +
        Number(
          !!a.data || !!a.jsonSource || !!a.identity || a.state !== p.state,
        ),
      updatedAt: Date.now(),
      leaseUntil: Date.now() + 180_000,
    })
    return null
  },
})
export const resume = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("catalogues")
      .withIndex("by_status", (q) => q.eq("status", "working"))
      .take(100)
    for (const c of rows)
      if (c.work && (c.leaseUntil ?? 0) < Date.now())
        await ctx.scheduler.runAfter(0, internal.catalogueActions.work, {
          id: c._id,
          generation: c.generation,
        })
    return null
  },
})
export const hold = internalMutation({
  args: { ...fenceArgs, work: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a)
    guardSize({ ...c, work: a.work })
    await ctx.db.patch(c._id, {
      work: a.work,
      leaseUntil: Date.now() + 180_000,
    })
    return null
  },
})
export const rankPage = internalMutation({
  args: {
    ...fenceArgs,
    initial: v.boolean(),
    rank: v.number(),
    products: v.array(v.object({ handle: v.string(), url: v.string() })),
  },
  returns: v.number(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a)
    let rank = a.rank,
      total = c.total,
      sourceCount = c.sourceCount
    const s = decode<Structure>(c.structure)
    for (const link of a.products) {
      let p = await ctx.db
        .query("produits")
        .withIndex("by_catalogue_handle", (q) =>
          q.eq("catalogueId", c._id).eq("handle", link.handle),
        )
        .unique()
      if (p?.aliasOf) p = await ctx.db.get(p.aliasOf)
      if (
        p &&
        (p.rank ?? Number.MAX_SAFE_INTEGER) !== Number.MAX_SAFE_INTEGER
      ) {
        rank = Math.max(rank, p.rank!)
        continue
      }
      rank++
      const selected =
        !!p?.selected || (a.initial && (c.mode === "ALL" || total < c.topN!))
      if (selected && !p?.selected) {
        total++
        for (const key of p?.collections ?? []) {
          const col = s.collections.find((x) => x.key === key)
          if (col) col.selectedCount++
        }
      }
      if (p) await ctx.db.patch(p._id, { rank, selected })
      else {
        sourceCount++
        await ctx.db.insert("produits", {
          catalogueId: c._id,
          handle: link.handle,
          url: link.url,
          identity: `url:${link.handle}`,
          selected,
          rank,
          title: link.handle,
          titleLower: link.handle.toLowerCase(),
          state: "pending",
          attempts: 0,
          collections: [],
          group: "~none",
          inSitemap: false,
        })
        if (
          !s.warnings.includes(
            "Des produits du classement sont absents du sitemap.",
          )
        )
          s.warnings.push("Des produits du classement sont absents du sitemap.")
      }
    }
    await ctx.db.patch(c._id, {
      total,
      sourceCount,
      structure: encode(s),
      version: c.version + 1,
    })
    return rank
  },
})

export const fillTop = internalMutation({
  args: fenceArgs,
  returns: v.boolean(),
  handler: async (ctx, a) => {
    const c = await fenced(ctx, a)
    if (c.mode !== "TOP_N" || c.total >= c.topN!) return false
    const p = await ctx.db
      .query("produits")
      .withIndex("by_catalogue_rank", (q) =>
        q
          .eq("catalogueId", c._id)
          .eq("selected", false)
          .gte("rank", 1)
          .lt("rank", Number.MAX_SAFE_INTEGER),
      )
      .first()
    if (!p) return false
    const s = decode<Structure>(c.structure)
    for (const col of s.collections)
      if (p.collections.includes(col.key)) col.selectedCount++
    await ctx.db.patch(p._id, { selected: true })
    await ctx.db.patch(c._id, {
      total: c.total + 1,
      complete: c.complete + Number(p.state === "complete"),
      failed: c.failed + Number(p.state === "failed"),
      structure: encode(s),
      version: c.version + 1,
    })
    return true
  },
})
