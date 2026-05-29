import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authz";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  IMAGE_PROVIDER: "openai",
  GENERATION_EXECUTION_MODE: "realtime",
  VIBE_ANALYSIS: "on",
  VIBE_MODEL: "gemini-2.5-flash-lite",
  OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  OPENAI_IMAGE_SIZE: "1024x1024",
  OPENAI_IMAGE_QUALITY: "medium",
  OPENAI_IMAGE_OUTPUT_FORMAT: "jpeg",
  OPENAI_IMAGE_REQUESTS_PER_MINUTE: 5,
  GEMINI_IMAGE_MODEL: "gemini-3-pro-image-preview",
  GEMINI_IMAGE_SIZE: "2K",
  GEMINI_IMAGE_ASPECT_RATIO: "1:1",
  GEMINI_IMAGE_REQUESTS_PER_MINUTE: 5,
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
    if (args.key === "IMAGE_PROVIDER" && args.value !== "openai" && args.value !== "gemini") {
      throw new Error("IMAGE_PROVIDER must be openai or gemini.");
    }
    if (args.key === "GENERATION_EXECUTION_MODE" && args.value !== "realtime" && args.value !== "batch") {
      throw new Error("GENERATION_EXECUTION_MODE must be realtime or batch.");
    }
    if (args.key === "VIBE_ANALYSIS" && args.value !== "on" && args.value !== "off") {
      throw new Error("VIBE_ANALYSIS must be on or off.");
    }
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert("appSettings", { key: args.key, value: args.value, updatedAt: Date.now() });
  }
});
