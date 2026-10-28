import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

export const candidateValidator = v.object({
  id: v.id("products"), shopifyProductId: v.string(), updatedAt: v.number(),
  lastSyncedAt: v.optional(v.number()),
});
export const syncStatusValidator = v.object({
  id: v.id("productSyncRuns"), shopId: v.id("shops"),
  status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
  phase: v.union(v.literal("syncing"), v.literal("reconciling"), v.literal("completed")),
  synced: v.number(), checked: v.number(), removed: v.number(),
  startedAt: v.number(), updatedAt: v.number(), completedAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});
export function publicSyncRun(run: Doc<"productSyncRuns">) {
  return { id: run._id, shopId: run.shopId, status: run.status, phase: run.phase,
    synced: run.synced, checked: run.checked, removed: run.removed,
    startedAt: run.startedAt, updatedAt: run.updatedAt,
    completedAt: run.completedAt ?? null, error: run.error ?? null };
}
