import { defineTable } from "convex/server"
import { v } from "convex/values"
import { configValidator, keywordValidator } from "./model"

export const seoTables = {
  seoProjects: defineTable({
    userId: v.id("users"), config: configValidator, filename: v.string(), headers: v.array(v.string()),
    keywordCount: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  seoKeywords: defineTable({ projectId: v.id("seoProjects"), ...keywordValidator.fields })
    .index("by_project", ["projectId"]),
  seoVersions: defineTable({
    projectId: v.id("seoProjects"), status: v.union(v.literal("running"), v.literal("ready"), v.literal("failed")),
    revision: v.number(), config: configValidator, originalJson: v.optional(v.string()), workingJson: v.optional(v.string()),
    model: v.optional(v.string()), error: v.optional(v.string()), workflowId: v.optional(v.string()),
    analysisVersion: v.optional(v.literal(2)),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_project", ["projectId"]),
}
