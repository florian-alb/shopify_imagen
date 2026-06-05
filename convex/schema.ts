import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const generationStatus = v.union(
  v.literal("not_started"),
  v.literal("generating"),
  v.literal("partial"),
  v.literal("ready"),
  v.literal("pushed"),
  v.literal("canceled"),
  v.literal("failed")
);

const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

const imageStatus = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("generated"),
  v.literal("uploaded"),
  v.literal("canceled"),
  v.literal("failed")
);

const reviewStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number())
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  products: defineTable({
    shopifyProductId: v.string(),
    title: v.string(),
    handle: v.string(),
    vendor: v.optional(v.union(v.string(), v.null())),
    productType: v.optional(v.union(v.string(), v.null())),
    shopifyStatus: v.optional(v.union(v.string(), v.null())),
    tags: v.array(v.string()),
    collections: v.array(v.any()),
    options: v.array(v.any()),
    variants: v.array(v.any()),
    metafields: v.array(v.any()),
    featuredImageUrl: v.optional(v.union(v.string(), v.null())),
    currentShopifyImages: v.array(v.any()),
    generationStatus,
    vibe: v.optional(v.union(v.string(), v.null())),
    vibeCostUsd: v.optional(v.number()),
    vibeAnalyzedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_shopify_product_id", ["shopifyProductId"])
    .index("by_handle", ["handle"])
    .index("by_generation_status", ["generationStatus"])
    .index("by_product_type", ["productType"])
    .index("by_generation_status_and_product_type", ["generationStatus", "productType"])
    .searchIndex("search_products", { searchField: "title", filterFields: ["generationStatus"] }),
  promptTemplates: defineTable({
    imageType: v.string(),
    label: v.string(),
    content: v.string(),
    defaultContent: v.string(),
    isActive: v.boolean(),
    // When true, this template is pre-checked in the generation chooser.
    // Optional so pre-existing rows default to non-preset.
    isPreset: v.optional(v.boolean()),
    // Display + Shopify publish order. Optional so pre-existing rows keep working;
    // rows without a position sort after positioned ones (see prompts.list).
    position: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_image_type", ["imageType"]),
  generationJobs: defineTable({
    status: jobStatus,
    mode: v.union(v.literal("single"), v.literal("bulk")),
    executionMode: v.optional(v.union(v.literal("realtime"), v.literal("batch"))),
    batchId: v.optional(v.union(v.string(), v.null())),
    previousBatchIds: v.optional(v.array(v.string())),
    batchStatus: v.optional(v.union(v.string(), v.null())),
    batchInputFileName: v.optional(v.union(v.string(), v.null())),
    batchIngestionStartedAt: v.optional(v.union(v.number(), v.null())),
    batchResultOffset: v.optional(v.number()),
    vibeAnalysis: v.optional(v.boolean()),
    imageProvider: v.optional(v.union(v.literal("openai"), v.literal("gemini"))),
    imageModel: v.optional(v.string()),
    productIds: v.array(v.id("products")),
    selectedImageTypes: v.array(v.string()),
    forceRegenerate: v.boolean(),
    totalTasks: v.number(),
    completedTasks: v.number(),
    failedTasks: v.number(),
    error: v.optional(v.union(v.string(), v.null())),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number())
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),
  generatedImages: defineTable({
    productId: v.id("products"),
    jobId: v.id("generationJobs"),
    imageType: v.string(),
    imageProvider: v.optional(v.union(v.literal("openai"), v.literal("gemini"))),
    imageModel: v.optional(v.string()),
    promptUsed: v.string(),
    sourceImageUrl: v.optional(v.union(v.string(), v.null())),
    sourceImageUrl2: v.optional(v.union(v.string(), v.null())),
    generatedImageUrl: v.optional(v.union(v.string(), v.null())),
    storageUrl: v.optional(v.union(v.string(), v.null())),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    status: imageStatus,
    reviewStatus: v.optional(reviewStatus),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
    shopifyMediaId: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    costRateMultiplier: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_product", ["productId"])
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),
  appSettings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number()
  }).index("by_key", ["key"])
});
