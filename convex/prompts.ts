import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authz";
import {
  backgroundConfigArgValidators,
  backgroundConfigFrom,
  hasBackgroundConfigInput,
} from "./background";
import {
  resolvePromptRuntime,
  validatePromptKind,
  validateReferenceImageCount,
} from "./promptRuntime";
import {
  promptSettingsForScope,
  promptsForScope,
} from "./prompts/repository";
import {
  getPromptForActiveShop,
  masterPromptPayload,
  sanitizeModelReferences,
  validateModelReferenceKey,
} from "./prompts/access";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
} from "./shopScope";

const MAX_MODEL_REFERENCE_BYTES = 10 * 1024 * 1024;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    return promptsForScope(ctx, scope);
  },
});

export const master = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const settings = await promptSettingsForScope(ctx, scope);
    return masterPromptPayload(ctx, scope, settings);
  },
});

export const updateMaster = mutation({
  args: {
    masterPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const masterPrompt = args.masterPrompt.trim();

    const existingSettings = await promptSettingsForScope(ctx, scope);
    const now = Date.now();
    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, {
        shopId: shop._id,
        masterPrompt,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("promptSettings", {
      shopId: shop._id,
      masterPrompt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateModelReferenceUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await ensureActiveShop(ctx, userId);
    return ctx.storage.generateUploadUrl();
  },
});

export const saveModelReference = mutation({
  args: {
    key: v.string(),
    storageId: v.id("_storage"),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const key = validateModelReferenceKey(args.key);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new Error("Uploaded model reference file not found.");
    const contentType = file.contentType?.trim() ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error("Model reference must be an image file.");
    }
    if (file.size > MAX_MODEL_REFERENCE_BYTES) {
      throw new Error("Model reference image must be 10 MB or smaller.");
    }

    const existingSettings = await promptSettingsForScope(ctx, scope);
    const modelReferences = sanitizeModelReferences(
      existingSettings?.modelReferences,
    );
    const now = Date.now();
    modelReferences[key] = {
      storageId: args.storageId,
      ...(args.fileName?.trim() ? { fileName: args.fileName.trim() } : {}),
      contentType,
      size: file.size,
      updatedAt: now,
    };

    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, {
        shopId: shop._id,
        modelReferences,
        updatedAt: now,
      });
      return;
    }

  await ctx.db.insert("promptSettings", {
    shopId: shop._id,
    masterPrompt: "",
    modelReferences,
    createdAt: now,
    updatedAt: now,
  });
  },
});

export const removeModelReference = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const key = validateModelReferenceKey(args.key);
    const existingSettings = await promptSettingsForScope(ctx, scope);
    if (!existingSettings) return;

    const modelReferences = sanitizeModelReferences(
      existingSettings.modelReferences,
    );
    delete modelReferences[key];

    await ctx.db.patch(existingSettings._id, {
      shopId: shop._id,
      modelReferences,
      updatedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    imageType: v.string(),
    label: v.string(),
    content: v.string(),
    isPreset: v.optional(v.boolean()),
    promptKind: v.optional(v.string()),
    useVibeAnalysis: v.optional(v.boolean()),
    referenceImageCount: v.optional(v.number()),
    ...backgroundConfigArgValidators,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const imageType = args.imageType.trim();
    const label = args.label.trim();
    const content = args.content.trim();
    if (!imageType || !label || !content)
      throw new Error("Image type, label, and content are required.");
    const promptKind = validatePromptKind(args.promptKind);
    const referenceImageCount = validateReferenceImageCount(
      args.referenceImageCount,
    );

    const existingPrompts = await promptsForScope(ctx, scope);
    const existing = existingPrompts.find((row) => row.imageType === imageType);
    if (existing)
      throw new Error(
        `A prompt template for "${imageType}" already exists in this shop.`,
      );

    const now = Date.now();
    const position = existingPrompts.reduce(
      (max, prompt) => Math.max(max, (prompt.position ?? -1) + 1),
      0,
    );
    return ctx.db.insert("promptTemplates", {
      shopId: shop._id,
      imageType,
      label,
      content,
      defaultContent: content,
      isActive: true,
      isPreset: args.isPreset ?? false,
      ...(promptKind ? { promptKind } : {}),
      position,
      useVibeAnalysis: args.useVibeAnalysis,
      referenceImageCount,
      ...backgroundConfigFrom(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setActive = mutation({
  args: { promptId: v.id("promptTemplates"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.patch(args.promptId, {
      shopId: shop._id,
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const setPreset = mutation({
  args: { promptId: v.id("promptTemplates"), isPreset: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    await getPromptForActiveShop(ctx, args.promptId, userId);
    await ctx.db.patch(args.promptId, {
      shopId: shop._id,
      isPreset: args.isPreset,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    promptId: v.id("promptTemplates"),
    imageType: v.optional(v.string()),
    content: v.string(),
    promptKind: v.optional(v.string()),
    useVibeAnalysis: v.optional(v.boolean()),
    referenceImageCount: v.optional(v.number()),
    ...backgroundConfigArgValidators,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const { prompt, scope } = await getPromptForActiveShop(
      ctx,
      args.promptId,
      userId,
    );
    const imageType = args.imageType?.trim() ?? prompt.imageType;
    const content = args.content.trim();
    const shouldPatchPromptKind = Object.prototype.hasOwnProperty.call(
      args,
      "promptKind",
    );
    const promptKind = shouldPatchPromptKind
      ? validatePromptKind(args.promptKind)
      : undefined;
    if (!imageType) throw new Error("Image type cannot be empty.");
    if (!content) throw new Error("Prompt content cannot be empty.");
    const referenceImageCount = validateReferenceImageCount(
      args.referenceImageCount,
    );
    if (imageType !== prompt.imageType) {
      const existingPrompts = await promptsForScope(ctx, scope);
      const existing = existingPrompts.find(
        (row) => row._id !== prompt._id && row.imageType === imageType,
      );
      if (existing) {
        throw new Error(
          `A prompt template for "${imageType}" already exists in shop.`,
        );
      }
    }
    const backgroundPatch = hasBackgroundConfigInput(args)
      ? backgroundConfigFrom({
          removeBackground: args.removeBackground ?? prompt.removeBackground,
          backgroundMode: args.backgroundMode ?? prompt.backgroundMode,
          backgroundColor: args.backgroundColor ?? prompt.backgroundColor,
          backgroundShadow: args.backgroundShadow ?? prompt.backgroundShadow,
        })
      : {};
    await ctx.db.patch(args.promptId, {
      shopId: shop._id,
      imageType,
      label: imageType,
      content,
      ...(shouldPatchPromptKind ? { promptKind } : {}),
      ...(args.useVibeAnalysis !== undefined
        ? { useVibeAnalysis: args.useVibeAnalysis }
        : {}),
      ...(referenceImageCount !== undefined ? { referenceImageCount } : {}),
      ...backgroundPatch,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { promptId: v.id("promptTemplates") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { prompt, scope } = await getPromptForActiveShop(
      ctx,
      args.promptId,
      userId,
    );
    await ctx.db.delete(prompt._id);

    const remainingPrompts = await promptsForScope(ctx, scope);
    const now = Date.now();
    await Promise.all(
      remainingPrompts.map((remainingPrompt, index) =>
        ctx.db.patch(remainingPrompt._id, { position: index, updatedAt: now }),
      ),
    );
  },
});

export const reorder = mutation({
  args: { orderedIds: v.array(v.id("promptTemplates")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const prompts = await Promise.all(
      args.orderedIds.map((promptId) => ctx.db.get(promptId)),
    );
    if (prompts.some((prompt) => !prompt || !shopMatchesScope(prompt, scope))) {
      throw new Error("Prompt order contains a template from another shop.");
    }
    const now = Date.now();
    await Promise.all(
      args.orderedIds.map((promptId, index) =>
        ctx.db.patch(promptId, {
          shopId: shop._id,
          position: index,
          updatedAt: now,
        }),
      ),
    );
  },
});
