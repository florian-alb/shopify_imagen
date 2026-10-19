import { v } from "convex/values"
import { mutation, query, internalQuery, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { requireUserId } from "./authz"
import { MAX_KEYWORDS, configValidator, keywordValidator, normalizeKeyword, validateMenuConfig } from "./seo/model"
import { parseDocument } from "./seo/validation"

async function owned(ctx: QueryCtx | MutationCtx, id: Id<"seoProjects">) {
  const userId = await requireUserId(ctx), project = await ctx.db.get(id)
  if (!project || project.userId !== userId) throw new Error("Projet introuvable.")
  return project
}

export const list = query({
  args: {}, returns: v.array(schema.doc("seoProjects")),
  handler: async ctx => {
    const userId = await requireUserId(ctx)
    return ctx.db.query("seoProjects").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(50)
  },
})
export const create = mutation({
  args: { config: configValidator, filename: v.string(), headers: v.array(v.string()), keywords: v.array(keywordValidator) },
  returns: v.id("seoProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    validateMenuConfig(args.config)
    if (!args.keywords.length || args.keywords.length > MAX_KEYWORDS || args.headers.length > 60
      || args.headers.some(h => h.length > 300) || args.filename.length > 250
      || new TextEncoder().encode(JSON.stringify(args)).byteLength > 400_000)
      throw new Error(`Import limité à ${MAX_KEYWORDS} mots-clés et 400 Ko de données.`)
    const keys = new Set<string>()
    for (const k of args.keywords) {
      if (!normalizeKeyword(k.keyword) || k.keyword.length > 500 || !k.key || k.key.length > 80 || keys.has(k.key)
        || !Number.isInteger(k.row) || k.row < 2 || k.raw.length !== args.headers.length || k.intent.length > 80
        || [k.volume, k.kd, k.cpc].some(n => n !== null && (!Number.isFinite(n) || n < 0)) || k.kd !== null && k.kd > 100)
        throw new Error("Lignes de mots-clés invalides.")
      keys.add(k.key)
    }
    const now = Date.now(), projectId = await ctx.db.insert("seoProjects", {
      userId, config: args.config, filename: args.filename, headers: args.headers,
      keywordCount: args.keywords.length, createdAt: now, updatedAt: now,
    })
    for (const keyword of args.keywords) await ctx.db.insert("seoKeywords", { projectId, ...keyword })
    return projectId
  },
})
export const workspace = query({
  args: { id: v.id("seoProjects") },
  returns: v.object({ project: schema.doc("seoProjects"), keywords: v.array(schema.doc("seoKeywords")),
    versions: v.array(v.object({ _id: v.id("seoVersions"), status: v.string(), createdAt: v.number() })) }),
  handler: async (ctx, { id }) => {
    const project = await owned(ctx, id)
    const keywords = await ctx.db.query("seoKeywords").withIndex("by_project", q => q.eq("projectId", id)).take(MAX_KEYWORDS)
    const versions = await ctx.db.query("seoVersions").withIndex("by_project", q => q.eq("projectId", id)).order("desc").take(20)
    return { project, keywords, versions: versions.map(({ _id, status, createdAt }) => ({ _id, status, createdAt })) }
  },
})
export const version = query({
  args: { id: v.id("seoVersions") }, returns: schema.doc("seoVersions"),
  handler: async (ctx, { id }) => {
    const version = await ctx.db.get(id)
    if (!version) throw new Error("Version introuvable.")
    await owned(ctx, version.projectId)
    return version
  },
})
export const generate = mutation({
  args: { id: v.id("seoProjects"), config: configValidator }, returns: v.id("seoVersions"),
  handler: async (ctx, { id, config }): Promise<Id<"seoVersions">> => {
    await owned(ctx, id)
    validateMenuConfig(config)
    const recent = await ctx.db.query("seoVersions").withIndex("by_project", q => q.eq("projectId", id)).order("desc").take(20)
    if (recent.some(v => v.status === "running")) throw new Error("Une analyse est déjà en cours.")
    // Bounded project history keeps this prototype's subscription and storage predictable.
    if (recent.length >= 20) throw new Error("Ce POC conserve 20 versions par projet. Créez un nouveau projet pour poursuivre.")
    const now = Date.now()
    const versionId = await ctx.db.insert("seoVersions", { projectId: id, config, analysisVersion: 2, status: "running", revision: 0, createdAt: now, updatedAt: now })
    await ctx.db.patch(id, { config, updatedAt: now })
    await ctx.runMutation(internal.seoWorkflows.start, { versionId })
    return versionId
  },
})
export const save = mutation({
  args: { versionId: v.id("seoVersions"), revision: v.number(), documentJson: v.string() }, returns: v.number(),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version) throw new Error("Version introuvable.")
    await owned(ctx, version.projectId)
    if (version.status !== "ready" || !version.workingJson) throw new Error("Cette version n’est pas modifiable.")
    if (version.revision !== args.revision) throw new Error("La version a changé. Rechargez-la avant d’enregistrer.")
    if (args.documentJson.length > 240_000) throw new Error("Analyse trop volumineuse.")
    const keywords = await ctx.db.query("seoKeywords").withIndex("by_project", q => q.eq("projectId", version.projectId)).take(MAX_KEYWORDS)
    const original = JSON.parse(version.originalJson!)
    const raw = JSON.parse(args.documentJson)
    if (raw.analysisVersion !== original.analysisVersion) throw new Error("La méthode d’analyse d’une version ne peut pas être modifiée.")
    const document = parseDocument(raw, keywords, original.sources, { analysisVersion: version.analysisVersion ?? original.analysisVersion })
    await ctx.db.patch(version._id, { workingJson: JSON.stringify(document), revision: version.revision + 1, updatedAt: Date.now() })
    return version.revision + 1
  },
})
export const context = internalQuery({
  args: { versionId: v.id("seoVersions") },
  returns: v.union(v.null(), v.object({ version: schema.doc("seoVersions"), project: schema.doc("seoProjects"), keywords: v.array(schema.doc("seoKeywords")) })),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId)
    if (!version || version.status !== "running") return null
    const project = await ctx.db.get(version.projectId)
    if (!project) return null
    const keywords = await ctx.db.query("seoKeywords").withIndex("by_project", q => q.eq("projectId", project._id)).take(MAX_KEYWORDS)
    return { version, project, keywords }
  },
})
export const complete = internalMutation({
  args: { versionId: v.id("seoVersions"), documentJson: v.string(), model: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version || version.status !== "running") return null
    // Only the internal worker supplies observations; client edits cannot alter them.
    const keywords = await ctx.db.query("seoKeywords").withIndex("by_project", q => q.eq("projectId", version.projectId)).take(MAX_KEYWORDS)
    const raw = JSON.parse(args.documentJson)
    const document = parseDocument(raw, keywords, raw.sources, { analysisVersion: version.analysisVersion ?? raw.analysisVersion })
    const json = JSON.stringify(document)
    await ctx.db.patch(version._id, { status: "ready", originalJson: json, workingJson: json, model: args.model,
      ...(document.analysisVersion === 2 ? { analysisVersion: 2 as const } : {}), updatedAt: Date.now() })
    return null
  },
})
export const fail = internalMutation({
  args: { versionId: v.id("seoVersions"), error: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (version?.status === "running") await ctx.db.patch(version._id, { status: "failed", error: args.error.slice(0, 1000), updatedAt: Date.now() })
    return null
  },
})
