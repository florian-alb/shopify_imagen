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

export const imagePublishRunStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("completed_with_errors"),
  v.literal("failed"),
);

export const imagePublishSummaryValidator = v.object({
  _id: v.id("imagePublishRuns"),
  status: imagePublishRunStatus,
  totalProducts: v.number(),
  processedProducts: v.number(),
  failedProducts: v.number(),
  totalImages: v.number(),
  pushedImages: v.number(),
  replaceExisting: v.boolean(),
  errors: v.array(v.object({ productTitle: v.string(), error: v.string() })),
});

export const publicationTables = {
  imagePublishRuns: defineTable({
    jobId: v.id("generationJobs"),
    shopId: v.optional(v.id("shops")),
    shopDomain: v.string(),
    includeLegacy: v.boolean(),
    createdByUserId: v.id("users"),
    status: imagePublishRunStatus,
    replaceExisting: v.boolean(),
    totalProducts: v.number(),
    processedProducts: v.number(),
    failedProducts: v.number(),
    totalImages: v.number(),
    pushedImages: v.number(),
    workflowId: v.optional(v.string()),
    tracksImageFeedback: v.optional(v.boolean()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_jobId_and_status", ["jobId", "status"]),
  imagePublishProducts: defineTable({
    runId: v.id("imagePublishRuns"),
    productId: v.id("products"),
    productTitle: v.string(),
    // A run accepts at most 250 selected images per product. Keep the source
    // URL alongside its ID so later retouches cannot change an approved push.
    images: v.array(
      v.object({ imageId: v.id("generatedImages"), storageUrl: v.string() }),
    ),
    position: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    pushedImages: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runId_and_position", ["runId", "position"])
    .index("by_runId_and_status", ["runId", "status"]),
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
