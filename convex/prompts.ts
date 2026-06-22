import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { defaultPrompts } from "./promptDefaults";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope
} from "./shopScope";

function comparePrompts(
  a: { position?: number; imageType: string },
  b: { position?: number; imageType: string }
) {
  const pa = a.position ?? Number.POSITIVE_INFINITY;
  const pb = b.position ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.imageType.localeCompare(b.imageType);
}

async function promptsForScope(ctx: { db: any }, scope: ShopScope) {
  const prompts = await ctx.db.query("promptTemplates").collect();
  return (prompts as Doc<"promptTemplates">[])
    .filter((prompt) => shopMatchesScope(prompt, scope))
    .sort(comparePrompts);
}

async function getPromptForActiveShop(ctx: { db: any }, promptId: Id<"promptTemplates">, userId: Id<"users">) {
  const scope = await getActiveShopScope(ctx, userId);
  const prompt = await ctx.db.get(promptId);
  if (!prompt || !shopMatchesScope(prompt, scope)) throw new Error("Prompt not found.");
  return { prompt: prompt as Doc<"promptTemplates">, scope };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    return promptsForScope(ctx, scope);
  }
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const now = Date.now();
    const existingPrompts = await promptsForScope(ctx, scope);
    let nextPosition = existingPrompts.reduce((max, prompt) => Math.max(max, (prompt.position ?? -1) + 1), 0);
    let created = 0;
    for (const prompt of defaultPrompts) {
      const existing = existingPrompts.find((row) => row.imageType === prompt.imageType);
      if (existing) {
        if (!existing.shopId) await ctx.db.patch(existing._id, { shopId: shop._id, updatedAt: now });
        continue;
      }
      await ctx.db.insert("promptTemplates", {
        shopId: shop._id,
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
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const imageType = args.imageType.trim();
    const label = args.label.trim();
    const content = args.content.trim();
    if (!imageType || !label || !content) throw new Error("Image type, label, and content are required.");

    const existingPrompts = await promptsForScope(ctx, scope);
    const existing = existingPrompts.find((row) => row.imageType === imageType);
    if (existing) throw new Error(`A prompt template for "${imageType}" already exists in this shop.`);

    const now = Date.now();
    const position = existingPrompts.reduce((max, prompt) => Math.max(max, (prompt.position ?? -1) + 1), 0);
    return ctx.db.insert("promptTemplates", {
      shopId: shop._id,
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

export const setActive = mutation({
  args: { promptId: v.id("promptTemplates"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.patch(args.promptId, { shopId: shop._id, isActive: args.isActive, updatedAt: Date.now() });
  }
});

export const setPreset = mutation({
  args: { promptId: v.id("promptTemplates"), isPreset: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.patch(args.promptId, { shopId: shop._id, isPreset: args.isPreset, updatedAt: Date.now() });
  }
});

export const update = mutation({
  args: {
    promptId: v.id("promptTemplates"),
    content: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    await getPromptForActiveShop(ctx, args.promptId, userId);
    const content = args.content.trim();
    if (!content) throw new Error("Prompt content cannot be empty.");
    await ctx.db.patch(args.promptId, { shopId: shop._id, content, updatedAt: Date.now() });
  }
});

export const remove = mutation({
  args: { promptId: v.id("promptTemplates") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { prompt, scope } = await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.delete(prompt._id);

    const remainingPrompts = await promptsForScope(ctx, scope);
    const now = Date.now();
    await Promise.all(
      remainingPrompts.map((remainingPrompt, index) =>
        ctx.db.patch(remainingPrompt._id, { position: index, updatedAt: now })
      )
    );
  }
});

export const reorder = mutation({
  args: { orderedIds: v.array(v.id("promptTemplates")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const prompts = await Promise.all(args.orderedIds.map((promptId) => ctx.db.get(promptId)));
    if (prompts.some((prompt) => !prompt || !shopMatchesScope(prompt, scope))) {
      throw new Error("Prompt order contains a template from another shop.");
    }
    const now = Date.now();
    await Promise.all(
      args.orderedIds.map((promptId, index) =>
        ctx.db.patch(promptId, { shopId: shop._id, position: index, updatedAt: now })
      )
    );
  }
});

export const reset = mutation({
  args: { promptId: v.id("promptTemplates") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const { prompt } = await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.patch(args.promptId, {
      shopId: shop._id,
      content: prompt.defaultContent,
      updatedAt: Date.now()
    });
  }
});
