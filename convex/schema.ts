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
  v.literal("failed"),
);

const productGenerationState = v.union(
  v.literal("not_started"),
  v.literal("generating"),
  v.literal("complete"),
  v.literal("incomplete"),
  v.literal("failed"),
  v.literal("canceled"),
);

const productReviewState = v.union(
  v.literal("none"),
  v.literal("needs_review"),
  v.literal("partially_approved"),
  v.literal("approved"),
  v.literal("rejected"),
);

const productPublishState = v.union(
  v.literal("not_ready"),
  v.literal("ready_to_push"),
  v.literal("partially_pushed"),
  v.literal("pushed"),
);

const productPrimaryAction = v.union(
  v.literal("generate"),
  v.literal("wait"),
  v.literal("review"),
  v.literal("push"),
  v.literal("fix_errors"),
  v.literal("done"),
);

const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const imageStatus = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("postprocessing"),
  v.literal("generated"),
  v.literal("uploaded"),
  v.literal("canceled"),
  v.literal("failed"),
);

const batchSegmentStatus = v.union(
  v.literal("submitting"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const reviewStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
const backgroundMode = v.union(v.literal("solid"), v.literal("transparent"));
const backgroundRemovalProvider = v.union(v.literal("fal_ideogram"), v.null());
const promptKind = v.union(
  v.literal("product_only"),
  v.literal("product_detail"),
  v.literal("product_scene"),
  v.literal("human_model"),
  v.literal("studio_product"),
  v.literal("detail_product"),
  v.literal("worn_model"),
  v.literal("lifestyle_model"),
);

const modelReference = v.object({
  storageId: v.id("_storage"),
  fileName: v.optional(v.string()),
  contentType: v.optional(v.string()),
  size: v.optional(v.number()),
  updatedAt: v.number(),
});

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
    approvalStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    approvalUpdatedAt: v.optional(v.number()),
    activeShopId: v.optional(v.union(v.id("shops"), v.null())),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
  .index("email", ["email"])
  .index("phone", ["phone"])
  .index("by_approval_status", ["approvalStatus"]),
  shops: defineTable({
    domain: v.string(),
    name: v.optional(v.union(v.string(), v.null())),
    clientId: v.optional(v.union(v.string(), v.null())),
    clientSecret: v.optional(v.union(v.string(), v.null())),
    productQuery: v.optional(v.union(v.string(), v.null())),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_domain", ["domain"])
    .index("by_created_by_user", ["createdByUserId"])
    .index("by_created_by_user_and_domain", ["createdByUserId", "domain"]),
  products: defineTable({
    shopId: v.optional(v.id("shops")),
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
    shopifyImageCount: v.optional(v.number()),
    generationStatus,
    generationState: v.optional(productGenerationState),
    reviewState: v.optional(productReviewState),
    publishState: v.optional(productPublishState),
    primaryAction: v.optional(productPrimaryAction),
    generatedImageCount: v.optional(v.number()),
    failedImageCount: v.optional(v.number()),
    publishedImageCount: v.optional(v.number()),
    publishableImageCount: v.optional(v.number()),
    pendingReviewCount: v.optional(v.number()),
    approvedImageCount: v.optional(v.number()),
    rejectedImageCount: v.optional(v.number()),
    latestJobId: v.optional(v.union(v.id("generationJobs"), v.null())),
    vibe: v.optional(v.union(v.string(), v.null())),
    vibeCostUsd: v.optional(v.number()),
    vibeAnalyzedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shop", ["shopId"])
    .index("by_shop_and_shopify_product_id", ["shopId", "shopifyProductId"])
    .index("by_shop_and_handle", ["shopId", "handle"])
    .index("by_shop_and_created", ["shopId", "createdAt"])
    .index("by_shop_and_generation_status", ["shopId", "generationStatus"])
    .index("by_shop_and_generation_state", ["shopId", "generationState"])
    .index("by_shop_and_review_state", ["shopId", "reviewState"])
    .index("by_shop_and_publish_state", ["shopId", "publishState"])
    .index("by_shop_and_primary_action", ["shopId", "primaryAction"])
    .index("by_shop_and_product_type", ["shopId", "productType"])
    .index("by_shop_and_shopify_status", ["shopId", "shopifyStatus"])
    .index("by_shop_and_generation_status_and_product_type", [
      "shopId",
      "generationStatus",
      "productType",
    ])
    .index("by_shop_and_primary_action_and_product_type", [
      "shopId",
      "primaryAction",
      "productType",
    ])
    .index("by_shopify_product_id", ["shopifyProductId"])
    .index("by_handle", ["handle"])
    .index("by_created", ["createdAt"])
    .index("by_generation_status", ["generationStatus"])
    .index("by_generation_state", ["generationState"])
    .index("by_review_state", ["reviewState"])
    .index("by_publish_state", ["publishState"])
    .index("by_primary_action", ["primaryAction"])
    .index("by_product_type", ["productType"])
    .index("by_shopify_status", ["shopifyStatus"])
    .index("by_generation_status_and_product_type", [
      "generationStatus",
      "productType",
    ])
    .index("by_primary_action_and_product_type", [
      "primaryAction",
      "productType",
    ])
    .searchIndex("search_products", {
      searchField: "title",
      filterFields: ["shopId", "generationStatus"],
    }),
  promptTemplates: defineTable({
  shopId: v.optional(v.id("shops")),
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
    useVibeAnalysis: v.optional(v.boolean()),
    referenceImageCount: v.optional(v.number()),
    promptKind: v.optional(promptKind),
    removeBackground: v.optional(v.boolean()),
    backgroundRemovalProvider: v.optional(backgroundRemovalProvider),
    backgroundMode: v.optional(backgroundMode),
    backgroundColor: v.optional(v.string()),
    backgroundShadow: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_image_type", ["imageType"])
    .index("by_shop_and_image_type", ["shopId", "imageType"])
    .index("by_shop_and_position", ["shopId", "position"]),
  promptSettings: defineTable({
    shopId: v.optional(v.id("shops")),
    masterPrompt: v.string(),
    defaultMasterPrompt: v.optional(v.string()),
    modelReferences: v.optional(v.record(v.string(), modelReference)),
  // Legacy optional field kept so existing rows remain readable during rollout.
  modelReferenceUrls: v.optional(v.record(v.string(), v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_shop", ["shopId"]),
  generationJobs: defineTable({
    shopId: v.optional(v.id("shops")),
    status: jobStatus,
    mode: v.union(v.literal("single"), v.literal("bulk")),
    executionMode: v.optional(
      v.union(v.literal("realtime"), v.literal("batch")),
    ),
    batchId: v.optional(v.union(v.string(), v.null())),
    previousBatchIds: v.optional(v.array(v.string())),
    batchStatus: v.optional(v.union(v.string(), v.null())),
    batchInputFileName: v.optional(v.union(v.string(), v.null())),
    batchIngestionStartedAt: v.optional(v.union(v.number(), v.null())),
    batchResultOffset: v.optional(v.number()),
    batchSubmitStartedAt: v.optional(v.number()),
    allBatchesSubmittedAt: v.optional(v.number()),
    firstResultReadyAt: v.optional(v.number()),
    firstImageStoredAt: v.optional(v.number()),
    vibeAnalysis: v.optional(v.boolean()),
    imageProvider: v.optional(
      v.union(v.literal("openai"), v.literal("gemini")),
    ),
    imageModel: v.optional(v.string()),
    productIds: v.array(v.id("products")),
    selectedImageTypes: v.array(v.string()),
    forceRegenerate: v.boolean(),
    totalTasks: v.number(),
    completedTasks: v.number(),
    failedTasks: v.number(),
    generationCost: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    pricedImageCount: v.optional(v.number()),
    reviewTotal: v.optional(v.number()),
    reviewPending: v.optional(v.number()),
    reviewApproved: v.optional(v.number()),
    reviewRejected: v.optional(v.number()),
    error: v.optional(v.union(v.string(), v.null())),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_shop_and_status", ["shopId", "status"])
    .index("by_shop_and_created", ["shopId", "createdAt"]),

  generationBatchSegments: defineTable({
    jobId: v.id("generationJobs"),
    provider: v.union(v.literal("openai"), v.literal("gemini")),
    batchId: v.optional(v.union(v.string(), v.null())),
    inputFileName: v.optional(v.union(v.string(), v.null())),
    batchStatus: v.optional(v.union(v.string(), v.null())),
    status: batchSegmentStatus,
    imageCount: v.number(),
    ingestedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    resultOffset: v.optional(v.number()),
    ingestionStartedAt: v.optional(v.union(v.number(), v.null())),
    submittedAt: v.optional(v.number()),
    providerDoneAt: v.optional(v.number()),
    ingestionCompletedAt: v.optional(v.number()),
    error: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"])
    .index("by_job_and_status", ["jobId", "status"])
    .index("by_batch_id", ["batchId"]),

  generatedImages: defineTable({
    shopId: v.optional(v.id("shops")),
    productId: v.id("products"),
    jobId: v.id("generationJobs"),
    imageType: v.string(),
    imageProvider: v.optional(
      v.union(v.literal("openai"), v.literal("gemini")),
    ),
    imageModel: v.optional(v.string()),
    promptUsed: v.string(),
    finalPromptUsed: v.optional(v.string()),
    promptKind: v.optional(promptKind),
    useVibeAnalysis: v.optional(v.boolean()),
    vibeUsed: v.optional(v.union(v.string(), v.null())),
    referenceImageCount: v.optional(v.number()),
    sourceImageUrls: v.optional(v.array(v.string())),
    sourceImageUrl: v.optional(v.union(v.string(), v.null())),
    sourceImageUrl2: v.optional(v.union(v.string(), v.null())),
    modelReferenceKey: v.optional(v.union(v.string(), v.null())),
    modelReferenceStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    modelReferenceUrl: v.optional(v.union(v.string(), v.null())),
    generatedImageUrl: v.optional(v.union(v.string(), v.null())),
    storageUrl: v.optional(v.union(v.string(), v.null())),
    retouchSourceImageId: v.optional(v.union(v.id("generatedImages"), v.null())),
    retouchTool: v.optional(v.union(v.literal("manual_brush"), v.null())),
    retouchedAt: v.optional(v.number()),
    retouchedByUserId: v.optional(v.id("users")),
    backgroundRemovalInputUrl: v.optional(v.union(v.string(), v.null())),
    backgroundRemovalInputContentType: v.optional(
      v.union(v.string(), v.null()),
    ),
    backgroundRemovalInputExtension: v.optional(v.union(v.string(), v.null())),
    postProcessingInputUrl: v.optional(v.union(v.string(), v.null())),
    postProcessingInputContentType: v.optional(v.union(v.string(), v.null())),
    postProcessingInputExtension: v.optional(v.union(v.string(), v.null())),
    postProcessingStartedAt: v.optional(v.union(v.number(), v.null())),
    transparentCutoutUrl: v.optional(v.union(v.string(), v.null())),
    batchSegmentId: v.optional(v.union(v.id("generationBatchSegments"), v.null())),
    providerBatchId: v.optional(v.union(v.string(), v.null())),
    providerRequestId: v.optional(v.union(v.string(), v.null())),
    providerResponseId: v.optional(v.union(v.string(), v.null())),
    removeBackground: v.optional(v.boolean()),
    backgroundRemovalProvider: v.optional(backgroundRemovalProvider),
    backgroundMode: v.optional(backgroundMode),
    backgroundColor: v.optional(v.string()),
    backgroundShadow: v.optional(v.boolean()),
    backgroundRemovalCostUsd: v.optional(v.number()),
    backgroundRemovalRequestId: v.optional(v.union(v.string(), v.null())),
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
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_job", ["jobId"])
    .index("by_status", ["status"])
    .index("by_job_and_status", ["jobId", "status"])
    .index("by_provider_batch_id", ["providerBatchId"])
    .index("by_batch_segment", ["batchSegmentId"])
    .index("by_review_status_and_reviewed_at", ["reviewStatus", "reviewedAt"])
    .index("by_shop_and_product", ["shopId", "productId"])
    .index("by_shop_and_job", ["shopId", "jobId"])
    .index("by_shop_and_status", ["shopId", "status"]),
  appSettings: defineTable({
    shopId: v.optional(v.id("shops")),
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_shop_and_key", ["shopId", "key"]),
});
