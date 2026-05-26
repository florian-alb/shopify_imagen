import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authz";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  OPENAI_IMAGE_SIZE: "1024x1024",
  OPENAI_IMAGE_QUALITY: "medium",
  OPENAI_IMAGE_OUTPUT_FORMAT: "jpeg",
  OPENAI_IMAGE_REQUESTS_PER_MINUTE: 5,
  GENERATION_CONCURRENCY: 1
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const rows = await ctx.db.query("appSettings").collect();
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  }
});

export const internalList = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("appSettings").collect();
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  }
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.any()
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("appSettings", { key: args.key, value: args.value, updatedAt: Date.now() });
  }
});
