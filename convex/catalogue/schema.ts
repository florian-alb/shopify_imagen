import { defineTable } from "convex/server"
import { v } from "convex/values"
export const catalogueTables = {
  catalogues: defineTable({
    ownerId: v.id("users"),
    origin: v.string(),
    mode: v.union(v.literal("ALL"), v.literal("TOP_N")),
    topN: v.optional(v.number()),
    status: v.union(
      v.literal("working"),
      v.literal("tags"),
      v.literal("ready"),
      v.literal("partial"),
      v.literal("blocked"),
    ),
    phase: v.string(),
    structure: v.string(),
    work: v.optional(v.string()),
    generation: v.number(),
    version: v.number(),
    lease: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    error: v.optional(v.string()),
    resumeWork: v.optional(v.string()),
    total: v.number(),
    complete: v.number(),
    failed: v.number(),
    sourceCount: v.number(),
    initialCount: v.number(),
    exportVersion: v.optional(v.number()),
    exportKey: v.optional(v.string()),
    lastImport: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    rankedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_origin_status", ["origin", "status"]),
  produits: defineTable({
    catalogueId: v.id("catalogues"),
    identity: v.string(),
    handle: v.string(),
    url: v.string(),
    selected: v.boolean(),
    collections: v.array(v.string()),
    group: v.string(),
    rank: v.optional(v.number()),
    title: v.string(),
    titleLower: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    jsonSource: v.optional(v.string()),
    data: v.optional(v.string()),
    override: v.optional(v.string()),
    error: v.optional(v.string()),
    remote: v.optional(v.string()),
    inSitemap: v.boolean(),
    aliasOf: v.optional(v.id("produits")),
  })
    .index("by_catalogue_handle", ["catalogueId", "handle"])
    .index("by_catalogue_identity", ["catalogueId", "identity"])
    .index("by_catalogue_rank", ["catalogueId", "selected", "rank"])
    .index("by_catalogue_title", ["catalogueId", "selected", "titleLower"])
    .index("by_catalogue_state", ["catalogueId", "selected", "state"])
    .index("by_catalogue_group", [
      "catalogueId",
      "selected",
      "group",
      "handle",
    ]),
}
