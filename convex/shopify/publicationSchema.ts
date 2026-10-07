import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

export const publicationResultValidator = v.object({
  pushed: v.number(),
  replaced: v.boolean(),
  publishMode: v.union(
    v.literal("separate_products"),
    v.literal("variant_media"),
  ),
  createdProducts: v.array(
    v.object({
      groupId: v.id("visualGroups"),
      shopifyProductId: v.string(),
      title: v.string(),
      handle: v.union(v.string(), v.null()),
    }),
  ),
});

export type PublicationResult = Infer<typeof publicationResultValidator>;

export const publicationTables = {
  productPublicationAttempts: defineTable({
    productId: v.id("products"),
    fingerprint: v.string(),
    state: v.union(
      v.literal("running"),
      v.literal("uncertain"),
      v.literal("completed"),
    ),
    leaseToken: v.string(),
    leaseExpiresAt: v.number(),
    siblingGroupId: v.optional(v.id("visualGroups")),
    siblingProductId: v.optional(v.string()),
    result: v.optional(publicationResultValidator),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_productId", ["productId"]),
  generatedMediaPublications: defineTable({
    productId: v.id("products"),
    imageId: v.id("generatedImages"),
    storageUrl: v.string(),
    targetProductId: v.string(),
    expectedAlt: v.string(),
    baselineMediaIds: v.array(v.string()),
    state: v.union(v.literal("submitting"), v.literal("completed")),
    shopifyMediaId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_imageId_and_storageUrl_and_targetProductId", [
    "imageId",
    "storageUrl",
    "targetProductId",
  ]),
};
