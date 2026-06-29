import { v } from "convex/values";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const jobStatusFilter = v.optional(
  v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
);

export const executionModeFilter = v.optional(
  v.union(v.literal("realtime"), v.literal("batch")),
);

export const providerFilter = v.optional(
  v.union(v.literal("openai"), v.literal("gemini")),
);

export const reviewFilter = v.optional(
  v.union(
    v.literal("to-review"),
    v.literal("approved"),
    v.literal("partial"),
    v.literal("rejected"),
    v.literal("no-review"),
  ),
);
