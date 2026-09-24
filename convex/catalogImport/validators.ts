import { v } from "convex/values"
export const operationStatus = v.union(
  ...[
    "queued",
    "running",
    "selecting",
    "review",
    "paused",
    "interrupted",
    "completed",
    "partial",
    "cancelled",
  ].map((s) => v.literal(s)),
)
export const taskKind = v.union(
  v.literal("menu"),
  v.literal("discover"),
  v.literal("collection"),
  v.literal("sitemap"),
  v.literal("index"),
  v.literal("products"),
  v.literal("assemble"),
  v.literal("importSetup"),
  v.literal("importProducts"),
  v.literal("importLinks"),
  v.literal("importFinish"),
)
export const taskSpec = v.object({
  key: v.string(),
  kind: taskKind,
  inputKey: v.string(),
})
export const productOverride = v.object({
  title: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  excluded: v.optional(v.boolean()),
  reviewed: v.optional(v.boolean()),
})
