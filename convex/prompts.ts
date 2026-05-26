import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authz";
import { defaultPrompts } from "./promptDefaults";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const prompts = await ctx.db.query("promptTemplates").collect();
    return prompts.sort((a, b) => a.imageType.localeCompare(b.imageType));
  }
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const now = Date.now();
    let created = 0;
    for (const prompt of defaultPrompts) {
      const existing = await ctx.db
        .query("promptTemplates")
        .withIndex("by_image_type", (q) => q.eq("imageType", prompt.imageType))
        .unique();
      if (existing) continue;
      await ctx.db.insert("promptTemplates", {
        imageType: prompt.imageType,
        label: prompt.label,
        content: prompt.content,
        defaultContent: prompt.content,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
      created += 1;
    }
    return { created };
  }
});

export const update = mutation({
  args: {
    promptId: v.id("promptTemplates"),
    content: v.string()
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const content = args.content.trim();
    if (!content) throw new Error("Prompt content cannot be empty.");
    await ctx.db.patch(args.promptId, {
      content,
      updatedAt: Date.now()
    });
  }
});

export const reset = mutation({
  args: { promptId: v.id("promptTemplates") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const prompt = await ctx.db.get(args.promptId);
    if (!prompt) throw new Error("Prompt not found.");
    await ctx.db.patch(args.promptId, {
      content: prompt.defaultContent,
      updatedAt: Date.now()
    });
  }
});
