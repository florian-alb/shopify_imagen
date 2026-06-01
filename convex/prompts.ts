import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authz";
import { defaultPrompts } from "./promptDefaults";

// Orders templates by their explicit `position`, falling back to imageType for
// rows that predate positioning (or ties). This is the canonical order used both
// in the settings UI and when publishing images to Shopify.
function comparePrompts(
  a: { position?: number; imageType: string },
  b: { position?: number; imageType: string }
) {
  const pa = a.position ?? Number.POSITIVE_INFINITY;
  const pb = b.position ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.imageType.localeCompare(b.imageType);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const prompts = await ctx.db.query("promptTemplates").collect();
    return prompts.sort(comparePrompts);
  }
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const now = Date.now();
    const existingPrompts = await ctx.db.query("promptTemplates").collect();
    let nextPosition = existingPrompts.reduce((max, prompt) => Math.max(max, (prompt.position ?? -1) + 1), 0);
    let created = 0;
    for (const prompt of defaultPrompts) {
      const existing = existingPrompts.find((row) => row.imageType === prompt.imageType);
      if (existing) continue;
      await ctx.db.insert("promptTemplates", {
        imageType: prompt.imageType,
        label: prompt.label,
        content: prompt.content,
        defaultContent: prompt.content,
        isActive: true,
        isPreset: prompt.isPreset ?? false,
        position: nextPosition,
        createdAt: now,
        updatedAt: now
      });
      nextPosition += 1;
      created += 1;
    }
    return { created };
  }
});

export const create = mutation({
  args: {
    imageType: v.string(),
    label: v.string(),
    content: v.string(),
    isPreset: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const imageType = args.imageType.trim();
    const label = args.label.trim();
    const content = args.content.trim();
    if (!imageType || !label || !content) throw new Error("Image type, label, and content are required.");
    const existing = await ctx.db
      .query("promptTemplates")
      .withIndex("by_image_type", (q) => q.eq("imageType", imageType))
      .unique();
    if (existing) throw new Error(`A prompt template for "${imageType}" already exists.`);
    const now = Date.now();
    const all = await ctx.db.query("promptTemplates").collect();
    const position = all.reduce((max, prompt) => Math.max(max, (prompt.position ?? -1) + 1), 0);
    return ctx.db.insert("promptTemplates", {
      imageType,
      label,
      content,
      defaultContent: content,
      isActive: true,
      isPreset: args.isPreset ?? false,
      position,
      createdAt: now,
      updatedAt: now
    });
  }
});

// Toggles whether a template is pre-checked in the generation chooser.
export const setPreset = mutation({
  args: { promptId: v.id("promptTemplates"), isPreset: v.boolean() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    await ctx.db.patch(args.promptId, { isPreset: args.isPreset, updatedAt: Date.now() });
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

// Persists a new ordering of templates. `orderedIds` is the full list of prompt
// ids in the desired order; each row's `position` is set to its array index so
// list() and the Shopify publish step follow the same sequence.
export const reorder = mutation({
  args: { orderedIds: v.array(v.id("promptTemplates")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const now = Date.now();
    await Promise.all(
      args.orderedIds.map((promptId, index) => ctx.db.patch(promptId, { position: index, updatedAt: now }))
    );
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
