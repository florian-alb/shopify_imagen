import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireUserId } from "./authz";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
} from "./shopScope";
import {
  buildVisualGroupDrafts,
  defaultVisualOptionNames,
  inferReferenceAssignment,
  nextVisualReferencePosition,
  visualReferencePosition,
  type ShopifyImageLike,
  type ShopifyOptionLike,
  type ShopifyVariantLike,
} from "./visualGroups/model";

const assignmentValidator = v.object({
  sourceReferenceId: v.id("visualGroupReferences"),
  groupKey: v.union(v.string(), v.null()),
  confidence: v.number(),
  referenceUrl: v.string(),
  crop: v.optional(
    v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    }),
  ),
});

const MAX_CONFIG_ROWS = 500;

async function configForProduct(
  ctx: { db: any },
  productId: Id<"products">,
): Promise<Doc<"visualGroupConfigs"> | null> {
  return ctx.db
    .query("visualGroupConfigs")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .unique();
}

function singleProductConfig(config: Doc<"visualGroupConfigs">) {
  return { ...config, publishMode: "variant_media" as const };
}

async function rowsForConfig(
  ctx: { db: any },
  configId: Id<"visualGroupConfigs">,
): Promise<{
  groups: Doc<"visualGroups">[];
  variants: Doc<"visualGroupVariants">[];
  references: Doc<"visualGroupReferences">[];
}> {
  const [groups, variants, references] = await Promise.all([
    ctx.db
      .query("visualGroups")
      .withIndex("by_config", (q: any) => q.eq("configId", configId))
      .take(MAX_CONFIG_ROWS),
    ctx.db
      .query("visualGroupVariants")
      .withIndex("by_config", (q: any) => q.eq("configId", configId))
      .take(MAX_CONFIG_ROWS),
    ctx.db
      .query("visualGroupReferences")
      .withIndex("by_config", (q: any) => q.eq("configId", configId))
      .take(MAX_CONFIG_ROWS),
  ]);
  return { groups, variants, references };
}

async function clearConfigRows(
  ctx: { db: any },
  configId: Id<"visualGroupConfigs">,
) {
  const { groups, variants, references } = await rowsForConfig(ctx, configId);
  if (
    groups.length >= MAX_CONFIG_ROWS ||
    variants.length >= MAX_CONFIG_ROWS ||
    references.length >= MAX_CONFIG_ROWS
  ) {
    throw new Error(
      "This visual configuration is too large to rebuild automatically.",
    );
  }
  await Promise.all([
    ...references.map((reference: Doc<"visualGroupReferences">) =>
      ctx.db.delete(reference._id),
    ),
    ...variants.map((variant: Doc<"visualGroupVariants">) =>
      ctx.db.delete(variant._id),
    ),
    ...groups.map((group: Doc<"visualGroups">) => ctx.db.delete(group._id)),
  ]);
}

function mappedProduct(product: Doc<"products">) {
  return {
    options: product.options as ShopifyOptionLike[],
    variants: product.variants as ShopifyVariantLike[],
    images: product.currentShopifyImages as ShopifyImageLike[],
  };
}

export const getForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const product = await ctx.db.get(args.productId);
    if (!product || !shopMatchesScope(product, scope)) return null;

    const mapped = mappedProduct(product);
    const config = await configForProduct(ctx, product._id);
    if (!config) {
      return {
        config: null,
        options: mapped.options,
        suggestedOptionNames: defaultVisualOptionNames(mapped.options),
        groups: [],
        unassignedReferences: [],
        family: null,
      };
    }

    const [{ groups, variants, references }, family] = await Promise.all([
      rowsForConfig(ctx, config._id),
      ctx.db
        .query("visualProductFamilies")
        .withIndex("by_source_product", (q) =>
          q.eq("sourceProductId", product._id),
        )
        .unique(),
    ]);
    const familyMembers = family
      ? await ctx.db
          .query("visualProductFamilyMembers")
          .withIndex("by_family", (q) => q.eq("familyId", family._id))
          .take(250)
      : [];
    const sortedGroups = [...groups].sort(
      (left, right) => left.position - right.position,
    );

    return {
      config: singleProductConfig(config),
      options: mapped.options,
      suggestedOptionNames: defaultVisualOptionNames(mapped.options),
      groups: sortedGroups.map((group) => {
        const groupVariants = variants.filter(
          (variant) => variant.groupId === group._id,
        );
        const groupReferences = references
          .filter((reference) => reference.groupId === group._id)
          .sort(
            (left, right) =>
              visualReferencePosition(left) - visualReferencePosition(right),
          );
        return {
          ...group,
          variants: groupVariants,
          references: groupReferences,
          ready: groupReferences.some((reference) => reference.confirmed),
        };
      }),
      unassignedReferences: references
        .filter((reference) => !reference.groupId)
        .sort((left, right) => left.position - right.position),
      family: family ? { family, members: familyMembers } : null,
    };
  },
});

export const configure = mutation({
  args: {
    productId: v.id("products"),
    optionNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const shop = await ensureActiveShop(ctx, userId);
    const scope = await getActiveShopScope(ctx, userId);
    const product = await ctx.db.get(args.productId);
    if (!product || !shopMatchesScope(product, scope)) {
      throw new Error("Product not found.");
    }

    const mapped = mappedProduct(product);
    const drafts = buildVisualGroupDrafts({
      options: mapped.options,
      variants: mapped.variants,
      optionNames: args.optionNames,
    });
    if (!drafts.length) {
      throw new Error("No Shopify variants match the selected visual options.");
    }

    const family = await ctx.db
      .query("visualProductFamilies")
      .withIndex("by_source_product", (q) =>
        q.eq("sourceProductId", product._id),
      )
      .unique();
    if (family) {
      throw new Error(
        "This product already has published sibling products. Its visual axes can no longer be rebuilt.",
      );
    }

    const now = Date.now();
    const existing = await configForProduct(ctx, product._id);
    let configId: Id<"visualGroupConfigs">;
    if (existing) {
      const generatedImages = await ctx.db
        .query("generatedImages")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .take(MAX_CONFIG_ROWS);
      if (generatedImages.some((image) => image.visualGroupId)) {
        throw new Error(
          "Visual options are locked after group image generation starts.",
        );
      }
      await clearConfigRows(ctx, existing._id);
      await ctx.db.patch(existing._id, {
        optionNames: args.optionNames,
        publishMode: "variant_media",
        analysisStatus: "not_started",
        analysisModel: null,
        analysisCostUsd: 0,
        analysisError: null,
        lastAnalyzedAt: null,
        updatedAt: now,
      });
      configId = existing._id;
    } else {
      configId = await ctx.db.insert("visualGroupConfigs", {
        shopId: shop._id,
        productId: product._id,
        optionNames: args.optionNames,
        publishMode: "variant_media",
        analysisStatus: "not_started",
        analysisModel: null,
        analysisCostUsd: 0,
        analysisError: null,
        lastAnalyzedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const groupIdByKey = new Map<string, Id<"visualGroups">>();
    for (const [position, draft] of drafts.entries()) {
      const groupId = await ctx.db.insert("visualGroups", {
        shopId: shop._id,
        configId,
        productId: product._id,
        key: draft.key,
        label: draft.label,
        optionValues: draft.optionValues,
        swatchCss: draft.swatchCss,
        position,
        createdAt: now,
        updatedAt: now,
      });
      groupIdByKey.set(draft.key, groupId);

      const variantsById = new Map(
        mapped.variants.map((variant) => [variant.id, variant]),
      );
      for (const variantId of draft.variantIds) {
        const variant = variantsById.get(variantId);
        if (!variant) continue;
        await ctx.db.insert("visualGroupVariants", {
          shopId: shop._id,
          configId,
          groupId,
          productId: product._id,
          shopifyVariantId: variant.id,
          title: variant.title ?? variant.id,
          selectedOptions: variant.selectedOptions ?? [],
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const [position, image] of mapped.images.entries()) {
      const assignment = inferReferenceAssignment({
        image,
        groups: drafts,
      });
      const mediaId = image.mediaId ?? image.id ?? null;
      const sourceUrl = (image as ShopifyImageLike & { url?: string | null })
        .url;
      if (!sourceUrl) continue;
      await ctx.db.insert("visualGroupReferences", {
        shopId: shop._id,
        configId,
        productId: product._id,
        groupId: assignment.groupKey
          ? (groupIdByKey.get(assignment.groupKey) ?? null)
          : null,
        mediaId,
        sourceUrl,
        referenceUrl: sourceUrl,
        altText: image.altText ?? null,
        assignmentSource: assignment.source,
        confidence: assignment.confidence,
        confirmed: assignment.confirmed,
        position,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.visualGroupAnalysis.analyzeConfiguredProduct,
      {
        productId: product._id,
        userId,
      },
    );

    return configId;
  },
});

export const setGroupSwatch = mutation({
  args: {
    groupId: v.id("visualGroups"),
    swatchCss: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const group = await ctx.db.get(args.groupId);
    if (!group || !shopMatchesScope(group, scope)) {
      throw new Error("Visual group not found.");
    }
    await ctx.db.patch(group._id, {
      swatchCss: args.swatchCss,
      updatedAt: Date.now(),
    });
    return group._id;
  },
});

async function assignReferenceToGroup(
  ctx: MutationCtx,
  args: {
    groupId: Id<"visualGroups">;
    mediaId: string;
  },
) {
  const userId = await requireUserId(ctx);
  const scope = await getActiveShopScope(ctx, userId);
  const group = await ctx.db.get(args.groupId);
  if (!group || !shopMatchesScope(group, scope)) {
    throw new Error("Visual group not found.");
  }

  const candidates = await ctx.db
    .query("visualGroupReferences")
    .withIndex("by_product_and_media_id", (q) =>
      q.eq("productId", group.productId).eq("mediaId", args.mediaId),
    )
    .take(20);
  const source =
    candidates.find((reference) => !reference.sourceReferenceId) ??
    candidates[0];
  if (!source || source.configId !== group.configId) {
    throw new Error("Reference image not found.");
  }

  const current = await ctx.db
    .query("visualGroupReferences")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .take(50);
  const existing = current.find(
    (reference) =>
      reference._id === source._id ||
      reference.sourceReferenceId === source._id ||
      (reference.mediaId && reference.mediaId === source.mediaId),
  );
  const now = Date.now();
  const groupPosition = nextVisualReferencePosition(current);

  if (existing) {
    await ctx.db.patch(existing._id, {
      assignmentSource: "manual",
      confidence: 1,
      confirmed: true,
      updatedAt: now,
    });
    return existing._id;
  }

  if (!source.groupId) {
    await ctx.db.patch(source._id, {
      groupId: group._id,
      assignmentSource: "manual",
      confidence: 1,
      confirmed: true,
      referenceUrl: source.sourceUrl,
      crop: undefined,
      groupPosition,
      updatedAt: now,
    });
    return source._id;
  }

  return ctx.db.insert("visualGroupReferences", {
    shopId: source.shopId,
    configId: source.configId,
    productId: source.productId,
    groupId: group._id,
    mediaId: source.mediaId ?? null,
    sourceUrl: source.sourceUrl,
    referenceUrl: source.sourceUrl,
    altText: source.altText ?? null,
    assignmentSource: "manual",
    confidence: 1,
    confirmed: true,
    sourceReferenceId: source.sourceReferenceId ?? source._id,
    position: source.position,
    groupPosition,
    createdAt: now,
    updatedAt: now,
  });
}

export const assignReference = mutation({
  args: {
    groupId: v.id("visualGroups"),
    mediaId: v.string(),
  },
  handler: assignReferenceToGroup,
});

// Kept for clients loaded before multi-reference selection was introduced.
export const setPrimaryReference = mutation({
  args: {
    groupId: v.id("visualGroups"),
    mediaId: v.string(),
  },
  handler: assignReferenceToGroup,
});

export const reorderReferences = mutation({
  args: {
    groupId: v.id("visualGroups"),
    referenceIds: v.array(v.id("visualGroupReferences")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const group = await ctx.db.get(args.groupId);
    if (!group || !shopMatchesScope(group, scope)) {
      throw new Error("Visual group not found.");
    }
    if (args.referenceIds.length > 50) {
      throw new Error("A visual group cannot contain more than 50 references.");
    }

    const references = await ctx.db
      .query("visualGroupReferences")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .take(51);
    const uniqueIds = new Set(args.referenceIds);
    const referenceById = new Map(
      references.map((reference) => [reference._id, reference]),
    );
    if (
      references.length > 50 ||
      uniqueIds.size !== args.referenceIds.length ||
      references.length !== args.referenceIds.length ||
      args.referenceIds.some((referenceId) => !referenceById.has(referenceId))
    ) {
      throw new Error("Reference order is out of date. Please try again.");
    }

    const now = Date.now();
    await Promise.all(
      args.referenceIds.map((referenceId, groupPosition) =>
        ctx.db.patch(referenceId, {
          groupPosition,
          updatedAt: now,
        }),
      ),
    );
    return args.referenceIds;
  },
});

export const confirmReference = mutation({
  args: { referenceId: v.id("visualGroupReferences") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const reference = await ctx.db.get(args.referenceId);
    if (!reference || !shopMatchesScope(reference, scope)) {
      throw new Error("Reference image not found.");
    }
    await ctx.db.patch(reference._id, {
      confirmed: true,
      updatedAt: Date.now(),
    });
    return reference._id;
  },
});

export const confirmGroupReferences = mutation({
  args: { groupId: v.id("visualGroups") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const group = await ctx.db.get(args.groupId);
    if (!group || !shopMatchesScope(group, scope)) {
      throw new Error("Visual group not found.");
    }

    const references = await ctx.db
      .query("visualGroupReferences")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .take(50);
    const pending = references.filter((reference) => !reference.confirmed);
    const now = Date.now();
    await Promise.all(
      pending.map((reference) =>
        ctx.db.patch(reference._id, {
          confirmed: true,
          updatedAt: now,
        }),
      ),
    );
    const configReferences = await ctx.db
      .query("visualGroupReferences")
      .withIndex("by_config", (q) => q.eq("configId", group.configId))
      .take(MAX_CONFIG_ROWS);
    const confirmedIds = new Set(pending.map((reference) => reference._id));
    const hasPendingAssignments = configReferences.some(
      (reference) =>
        reference.groupId &&
        !reference.confirmed &&
        !confirmedIds.has(reference._id),
    );
    if (!hasPendingAssignments) {
      await ctx.db.patch(group.configId, {
        analysisStatus: "ready",
        updatedAt: now,
      });
    }
    return { confirmed: pending.length };
  },
});

export const removeReference = mutation({
  args: { referenceId: v.id("visualGroupReferences") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const reference = await ctx.db.get(args.referenceId);
    if (!reference || !shopMatchesScope(reference, scope)) {
      throw new Error("Reference image not found.");
    }
    if (reference.sourceReferenceId) {
      await ctx.db.delete(reference._id);
      return reference._id;
    }
    await ctx.db.patch(reference._id, {
      groupId: null,
      confirmed: false,
      assignmentSource: "rule",
      confidence: 0,
      referenceUrl: reference.sourceUrl,
      crop: undefined,
      groupPosition: undefined,
      updatedAt: Date.now(),
    });
    return reference._id;
  },
});

export const analysisContext = internalQuery({
  args: {
    productId: v.id("products"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    const scope = await getActiveShopScope(ctx, args.userId);
    if (!product || !shopMatchesScope(product, scope)) return null;
    const config = await configForProduct(ctx, product._id);
    if (!config) return null;
    const rows = await rowsForConfig(ctx, config._id);
    return { product, config: singleProductConfig(config), ...rows };
  },
});

export const setAnalysisStatus = internalMutation({
  args: {
    configId: v.id("visualGroupConfigs"),
    status: v.union(
      v.literal("running"),
      v.literal("ready"),
      v.literal("needs_review"),
      v.literal("failed"),
    ),
    model: v.optional(v.union(v.string(), v.null())),
    costUsd: v.optional(v.number()),
    error: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.configId, {
      analysisStatus: args.status,
      ...(args.model !== undefined ? { analysisModel: args.model } : {}),
      ...(args.costUsd !== undefined ? { analysisCostUsd: args.costUsd } : {}),
      ...(args.error !== undefined ? { analysisError: args.error } : {}),
      lastAnalyzedAt: args.status === "running" ? undefined : Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const applyAnalysis = internalMutation({
  args: {
    configId: v.id("visualGroupConfigs"),
    assignments: v.array(assignmentValidator),
    model: v.string(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Visual configuration not found.");
    const { groups, references } = await rowsForConfig(ctx, config._id);
    const staleSuggestions = references.filter(
      (reference) =>
        reference.sourceReferenceId &&
        !reference.confirmed &&
        (reference.assignmentSource === "ai" ||
          reference.assignmentSource === "ai_crop"),
    );
    await Promise.all(
      staleSuggestions.map((reference) => ctx.db.delete(reference._id)),
    );
    const groupByKey = new Map(groups.map((group) => [group.key, group]));
    const referenceById = new Map(
      references.map((reference) => [reference._id, reference]),
    );
    const nextPositionByGroupId = new Map(
      groups.map((group) => [
        group._id,
        nextVisualReferencePosition(
          references.filter(
            (reference) =>
              reference.groupId === group._id && reference.confirmed,
          ),
        ),
      ]),
    );
    const seen = new Map<Id<"visualGroupReferences">, number>();
    let suggested = 0;
    let unmatched = 0;

    for (const assignment of args.assignments) {
      const source = referenceById.get(assignment.sourceReferenceId);
      if (!source || source.configId !== config._id || source.confirmed)
        continue;
      const group = assignment.groupKey
        ? groupByKey.get(assignment.groupKey)
        : null;
      const occurrence = seen.get(source._id) ?? 0;
      seen.set(source._id, occurrence + 1);
      const now = Date.now();
      const groupPosition = group
        ? (nextPositionByGroupId.get(group._id) ?? 0)
        : undefined;
      if (group && groupPosition !== undefined) {
        nextPositionByGroupId.set(group._id, groupPosition + 1);
      }

      if (occurrence === 0) {
        await ctx.db.patch(source._id, {
          groupId: group?._id ?? null,
          assignmentSource: assignment.crop ? "ai_crop" : "ai",
          confidence: assignment.confidence,
          confirmed: false,
          referenceUrl: assignment.referenceUrl,
          ...(assignment.crop
            ? { crop: assignment.crop }
            : { crop: undefined }),
          groupPosition,
          updatedAt: now,
        });
      } else if (group) {
        await ctx.db.insert("visualGroupReferences", {
          shopId: source.shopId,
          configId: source.configId,
          productId: source.productId,
          groupId: group._id,
          mediaId: source.mediaId ?? null,
          sourceUrl: source.sourceUrl,
          referenceUrl: assignment.referenceUrl,
          altText: source.altText ?? null,
          assignmentSource: assignment.crop ? "ai_crop" : "ai",
          confidence: assignment.confidence,
          confirmed: false,
          ...(assignment.crop ? { crop: assignment.crop } : {}),
          sourceReferenceId: source._id,
          position: source.position,
          groupPosition,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (group) suggested += 1;
      else if (occurrence === 0) unmatched += 1;
    }

    await ctx.db.patch(config._id, {
      analysisStatus: suggested || unmatched ? "needs_review" : "ready",
      analysisModel: args.model,
      analysisCostUsd: args.costUsd,
      analysisError: null,
      lastAnalyzedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { suggested, unmatched };
  },
});

export const groupTargets = internalQuery({
  args: { groupIds: v.array(v.id("visualGroups")) },
  handler: async (ctx, args) => {
    const targets: Array<{
      group: Doc<"visualGroups">;
      variants: Doc<"visualGroupVariants">[];
      references: Doc<"visualGroupReferences">[];
    }> = [];
    for (const groupId of Array.from(new Set(args.groupIds))) {
      const group = await ctx.db.get(groupId);
      if (!group) continue;
      const [variants, references] = await Promise.all([
        ctx.db
          .query("visualGroupVariants")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .take(250),
        ctx.db
          .query("visualGroupReferences")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .take(50),
      ]);
      targets.push({
        group,
        variants,
        references: references.filter((reference) => reference.confirmed),
      });
    }
    return targets;
  },
});

export const createFamily = internalMutation({
  args: {
    sourceProductId: v.id("products"),
    members: v.array(
      v.object({
        groupId: v.id("visualGroups"),
        shopifyProductId: v.string(),
        title: v.string(),
        handle: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.sourceProductId);
    if (!product?.shopId) throw new Error("Source product has no shop.");
    const config = await configForProduct(ctx, product._id);
    if (!config) throw new Error("Visual configuration not found.");
    const existing = await ctx.db
      .query("visualProductFamilies")
      .withIndex("by_source_product", (q) =>
        q.eq("sourceProductId", product._id),
      )
      .unique();
    const now = Date.now();
    const familyId =
      existing?._id ??
      (await ctx.db.insert("visualProductFamilies", {
        shopId: product.shopId,
        sourceProductId: product._id,
        sourceShopifyProductId: product.shopifyProductId,
        configId: config._id,
        createdAt: now,
        updatedAt: now,
      }));

    const existingMembers = await ctx.db
      .query("visualProductFamilyMembers")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .take(250);
    for (const member of existingMembers) {
      await ctx.db.delete(member._id);
    }
    for (const member of args.members) {
      const group = await ctx.db.get(member.groupId);
      if (!group || group.configId !== config._id) continue;
      await ctx.db.insert("visualProductFamilyMembers", {
        shopId: product.shopId,
        familyId,
        groupId: group._id,
        shopifyProductId: member.shopifyProductId,
        title: member.title,
        handle: member.handle ?? null,
        swatchCss: group.swatchCss ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return familyId;
  },
});

export const familyForSource = internalQuery({
  args: { sourceProductId: v.id("products") },
  handler: async (ctx, args) => {
    const family = await ctx.db
      .query("visualProductFamilies")
      .withIndex("by_source_product", (q) =>
        q.eq("sourceProductId", args.sourceProductId),
      )
      .unique();
    if (!family) return null;
    const members = await ctx.db
      .query("visualProductFamilyMembers")
      .withIndex("by_family", (q) => q.eq("familyId", family._id))
      .take(250);
    return { family, members };
  },
});
