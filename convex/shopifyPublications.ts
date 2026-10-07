import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { publicationResultValidator } from "./shopify/publicationSchema";
import schema from "./schema";

export const PUBLICATION_LEASE_MS = 11 * 60 * 1000;

async function ownedAttempt(
  ctx: MutationCtx,
  productId: Id<"products">,
  token: string,
) {
  const attempt = await ctx.db
    .query("productPublicationAttempts")
    .withIndex("by_productId", (q) => q.eq("productId", productId))
    .unique();
  if (
    !attempt ||
    attempt.state !== "running" ||
    attempt.leaseToken !== token ||
    attempt.leaseExpiresAt <= Date.now()
  ) {
    throw new Error(
      "Publication ownership expired. Retry the publication to reconcile its progress.",
    );
  }
  return attempt;
}

export const claim = internalMutation({
  args: {
    productId: v.id("products"),
    fingerprint: v.string(),
    token: v.string(),
  },
  returns: v.union(
    v.object({
      state: v.literal("completed"),
      result: publicationResultValidator,
    }),
    v.object({ state: v.literal("running"), resumed: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const previous = await ctx.db
      .query("productPublicationAttempts")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .unique();
    if (
      previous?.state === "completed" &&
      previous.fingerprint === args.fingerprint
    ) {
      return { state: "completed" as const, result: previous.result! };
    }
    if (previous && previous.state !== "completed") {
      if (previous.leaseExpiresAt > now)
        throw new Error("Une publication de ce produit est déjà en cours.");
      if (previous.fingerprint !== args.fingerprint) {
        throw new Error(
          "La publication précédente est incertaine. Reprenez la même sélection avant de publier d’autres images.",
        );
      }
      if (previous.siblingGroupId && !previous.siblingProductId) {
        throw new Error(
          "La création du produit séparé est incertaine. Vérifiez Shopify avant toute nouvelle publication.",
        );
      }
      await ctx.db.patch(previous._id, {
        state: "running",
        leaseToken: args.token,
        leaseExpiresAt: now + PUBLICATION_LEASE_MS,
        error: undefined,
        updatedAt: now,
      });
      return { state: "running" as const, resumed: true };
    }
    const fields = {
      productId: args.productId,
      fingerprint: args.fingerprint,
      state: "running" as const,
      leaseToken: args.token,
      leaseExpiresAt: now + PUBLICATION_LEASE_MS,
      createdAt: now,
      updatedAt: now,
    };
    if (previous) await ctx.db.replace(previous._id, fields);
    else await ctx.db.insert("productPublicationAttempts", fields);
    return { state: "running" as const, resumed: false };
  },
});

export const fail = internalMutation({
  args: { productId: v.id("products"), token: v.string(), error: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("productPublicationAttempts")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .unique();
    if (
      !attempt ||
      attempt.state !== "running" ||
      attempt.leaseToken !== args.token
    )
      return false;
    await ctx.db.patch(attempt._id, {
      state: "uncertain",
      leaseExpiresAt: 0,
      error: args.error,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const complete = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    result: publicationResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ownedAttempt(ctx, args.productId, args.token);
    await ctx.db.patch(attempt._id, {
      state: "completed",
      leaseExpiresAt: 0,
      result: args.result,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const beginSibling = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    groupId: v.id("visualGroups"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const attempt = await ownedAttempt(ctx, args.productId, args.token);
    if (attempt.siblingGroupId === args.groupId && attempt.siblingProductId)
      return attempt.siblingProductId;
    await ctx.db.patch(attempt._id, {
      siblingGroupId: args.groupId,
      siblingProductId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordSibling = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    groupId: v.id("visualGroups"),
    targetProductId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ownedAttempt(ctx, args.productId, args.token);
    if (attempt.siblingGroupId !== args.groupId)
      throw new Error("Sibling publication identity changed.");
    await ctx.db.patch(attempt._id, {
      siblingProductId: args.targetProductId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const mediaForImages = internalQuery({
  args: {
    targetProductId: v.string(),
    images: v.array(
      v.object({ imageId: v.id("generatedImages"), storageUrl: v.string() }),
    ),
  },
  returns: v.array(v.union(schema.doc("generatedMediaPublications"), v.null())),
  handler: async (ctx, args) =>
    Promise.all(
      args.images.map((image) =>
        ctx.db
          .query("generatedMediaPublications")
          .withIndex("by_imageId_and_storageUrl_and_targetProductId", (q) =>
            q
              .eq("imageId", image.imageId)
              .eq("storageUrl", image.storageUrl)
              .eq("targetProductId", args.targetProductId),
          )
          .unique(),
      ),
    ),
});

export const beginMedia = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    targetProductId: v.string(),
    baselineMediaIds: v.array(v.string()),
    images: v.array(
      v.object({
        imageId: v.id("generatedImages"),
        storageUrl: v.string(),
        expectedAlt: v.string(),
      }),
    ),
  },
  returns: v.array(v.id("generatedMediaPublications")),
  handler: async (ctx, args) => {
    await ownedAttempt(ctx, args.productId, args.token);
    const ids = [];
    for (const image of args.images) {
      const current = await ctx.db.get(image.imageId);
      if (
        !current ||
        current.productId !== args.productId ||
        current.storageUrl !== image.storageUrl ||
        current.reviewStatus !== "approved"
      ) {
        throw new Error(
          "The selected generated image changed before publication. Refresh the product.",
        );
      }
      const existing = await ctx.db
        .query("generatedMediaPublications")
        .withIndex("by_imageId_and_storageUrl_and_targetProductId", (q) =>
          q
            .eq("imageId", image.imageId)
            .eq("storageUrl", image.storageUrl)
            .eq("targetProductId", args.targetProductId),
        )
        .unique();
      if (existing)
        throw new Error(
          "A media publication intent already exists. Reconcile before creating media.",
        );
      ids.push(
        await ctx.db.insert("generatedMediaPublications", {
          productId: args.productId,
          ...image,
          targetProductId: args.targetProductId,
          baselineMediaIds: args.baselineMediaIds,
          state: "submitting",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
    }
    return ids;
  },
});

export const recordMedia = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    media: v.array(
      v.object({
        publicationId: v.id("generatedMediaPublications"),
        shopifyMediaId: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownedAttempt(ctx, args.productId, args.token);
    for (const item of args.media) {
      const row = await ctx.db.get(item.publicationId);
      if (!row || row.productId !== args.productId)
        throw new Error("Media publication does not belong to this product.");
      if (
        row.state === "completed" &&
        row.shopifyMediaId !== item.shopifyMediaId
      )
        throw new Error("Media publication identity changed.");
      await ctx.db.patch(row._id, {
        state: "completed",
        shopifyMediaId: item.shopifyMediaId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const adoptUploadedMedia = internalMutation({
  args: {
    productId: v.id("products"),
    token: v.string(),
    targetProductId: v.string(),
    images: v.array(
      v.object({
        imageId: v.id("generatedImages"),
        storageUrl: v.string(),
        expectedAlt: v.string(),
        shopifyMediaId: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownedAttempt(ctx, args.productId, args.token);
    const product = await ctx.db.get(args.productId);
    for (const image of args.images) {
      const current = await ctx.db.get(image.imageId);
      if (
        !current ||
        current.productId !== args.productId ||
        current.status !== "uploaded" ||
        current.storageUrl !== image.storageUrl ||
        current.shopifyMediaId !== image.shopifyMediaId ||
        (current.publishedShopifyProductId ?? product?.shopifyProductId) !==
          args.targetProductId
      ) {
        throw new Error(
          "The previously uploaded image changed before reconciliation.",
        );
      }
      const existing = await ctx.db
        .query("generatedMediaPublications")
        .withIndex("by_imageId_and_storageUrl_and_targetProductId", (q) =>
          q
            .eq("imageId", image.imageId)
            .eq("storageUrl", image.storageUrl)
            .eq("targetProductId", args.targetProductId),
        )
        .unique();
      if (existing)
        throw new Error("Media publication identity already exists.");
      await ctx.db.insert("generatedMediaPublications", {
        productId: args.productId,
        targetProductId: args.targetProductId,
        ...image,
        baselineMediaIds: [],
        state: "completed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
