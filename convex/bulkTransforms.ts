import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUserId } from "./authz";
import {
  BULK_TRANSFORM_ASSET_RETENTION_MS,
  BULK_TRANSFORM_OPERATION,
  MAX_BULK_TRANSFORM_IMAGE_POSITIONS,
  bulkTransformImagePositionIsSelected,
  bulkTransformJobIsTerminal,
  bulkTransformMediaIdFingerprint,
  bulkTransformResumeTask,
  cacheBustedShopifyImageUrl,
  eligibleShopifyImages,
  normalizeBulkTransformImagePositions,
  replaceCachedShopifyImageUrl,
  selectedCachedShopifyMediaIds,
  type BulkTransformRetryPhase,
} from "./bulkTransforms/model";
import {
  ensureActiveShop,
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope,
  type ShopifyCredentials,
} from "./shopScope";
import { getAccessToken, shopifyGraphql } from "./shopify/client";
import { SHOPIFY_ACCESS_SCOPES_QUERY } from "./shopify/graphql";

const MAX_PRODUCTS_PER_JOB = 250;
const RESET_BATCH_SIZE = 25;
const PREVIEW_SAMPLE_SIZE = 4;
const ERROR_SAMPLE_SIZE = 4;
const MAX_SEED_ATTEMPTS = 3;
const PUBLISHED_CACHE_UPDATE_BATCH_SIZE = 10;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const ASSET_CLEANUP_LEASE_MS = 30 * 60 * 1000;
const BULK_HISTORY_MAX_PAGE_SIZE = 100;
const SELECTION_PREVIEW_SIZE = 3;
const ACTIVE_JOB_STATUSES = [
  "queued",
  "transforming",
  "ready",
  "publishing",
] as const;

type JobReadCtx = QueryCtx | MutationCtx;

function shopIdsForScope(scope: ShopScope) {
  return [
    ...(scope.shopId ? [scope.shopId] : []),
    ...(scope.includeLegacy ? [undefined] : []),
  ] as Array<Id<"shops"> | undefined>;
}

function bulkTransformSelectionSnapshot(products: Doc<"products">[]) {
  return bulkTransformMediaIdFingerprint(
    products.flatMap((product) => [
      `product:${product._id}`,
      ...selectedCachedShopifyMediaIds(product.currentShopifyImages, undefined),
    ]),
  );
}

function retryPhaseForJob(job: Doc<"bulkTransformJobs">) {
  if (job.conflictItems > 0) return "conflict" as const;
  if (job.transformFailedItems > 0) return "transform" as const;
  if (job.publishFailedItems > 0) return "publish" as const;
  return null;
}

async function jobForUser(
  ctx: JobReadCtx,
  jobId: Id<"bulkTransformJobs">,
  userId: Id<"users">,
) {
  const scope = await getActiveShopScope(ctx, userId);
  const job = await ctx.db.get(jobId);
  if (!job || !shopMatchesScope(job, scope)) return null;
  return job;
}

async function assertNoOtherActiveJob(
  ctx: MutationCtx,
  scope: ShopScope,
  excludedJobId?: Id<"bulkTransformJobs">,
) {
  for (const shopId of shopIdsForScope(scope)) {
    for (const status of ACTIVE_JOB_STATUSES) {
      const active = await ctx.db
        .query("bulkTransformJobs")
        .withIndex("by_shop_and_status", (q) =>
          q.eq("shopId", shopId).eq("status", status),
        )
        .take(2);
      if (active.some((job) => job._id !== excludedJobId)) {
        throw new Error(
          "Another bulk image operation is already active for this shop.",
        );
      }
    }
  }
}

async function latestActiveJobForShop(
  ctx: QueryCtx,
  shopId: Id<"shops"> | undefined,
) {
  const candidates = await Promise.all(
    ACTIVE_JOB_STATUSES.map((status) =>
      ctx.db
        .query("bulkTransformJobs")
        .withIndex("by_shop_and_status", (q) =>
          q.eq("shopId", shopId).eq("status", status),
        )
        .order("desc")
        .first(),
    ),
  );
  return (
    candidates
      .filter((job): job is Doc<"bulkTransformJobs"> => Boolean(job))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  );
}

async function requireWriteFilesScope(credentials: ShopifyCredentials) {
  const accessToken = await getAccessToken(credentials);
  const data = await shopifyGraphql<{
    currentAppInstallation: {
      accessScopes: Array<{ handle: string }>;
    } | null;
  }>(SHOPIFY_ACCESS_SCOPES_QUERY, {}, accessToken, credentials);
  const scopes = new Set(
    data.currentAppInstallation?.accessScopes.map((scope) => scope.handle) ??
      [],
  );
  if (!scopes.has("write_files")) {
    throw new ConvexError(
      "Le scope Shopify write_files est requis. Ajoute-le aux scopes Admin API de l’application personnalisée, enregistre la configuration, puis relance la publication.",
    );
  }
}

export const start = action({
  args: {
    productIds: v.array(v.id("products")),
    operation: v.literal(BULK_TRANSFORM_OPERATION),
    imagePositions: v.optional(v.array(v.number())),
    selectionSnapshotToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"bulkTransformJobs">> => {
    const userId = await requireUserId(ctx);
    return await ctx.runMutation(internal.bulkTransforms.createJob, {
      userId,
      productIds: args.productIds,
      operation: args.operation,
      imagePositions: args.imagePositions,
      selectionSnapshotToken: args.selectionSnapshotToken,
    });
  },
});

export const publish = action({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args): Promise<Id<"bulkTransformJobs">> => {
    const userId = await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.bulkTransforms.getJobForUser, {
      jobId: args.jobId,
      userId,
    })) as Doc<"bulkTransformJobs"> | null;
    if (!job) throw new Error("Bulk transform job not found.");
    const credentials = (await ctx.runQuery(
      internal.shops.getShopifyCredentials,
      {
        shopId: job.shopId ?? null,
        ...(job.shopId ? { userId } : {}),
      },
    )) as ShopifyCredentials;
    await requireWriteFilesScope(credentials);
    await ctx.runMutation(internal.bulkTransforms.startPublishing, {
      jobId: job._id,
    });
    return job._id;
  },
});

export const latestUndismissed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const activeCandidates = await Promise.all([
      scope.shopId
        ? latestActiveJobForShop(ctx, scope.shopId)
        : Promise.resolve(null),
      scope.includeLegacy
        ? latestActiveJobForShop(ctx, undefined)
        : Promise.resolve(null),
    ]);
    const active = activeCandidates
      .filter((job): job is Doc<"bulkTransformJobs"> => Boolean(job))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (active) return active;
    const scoped = scope.shopId
      ? await ctx.db
          .query("bulkTransformJobs")
          .withIndex("by_shop_and_dismissed_at", (q) =>
            q.eq("shopId", scope.shopId).eq("dismissedAt", undefined),
          )
          .order("desc")
          .first()
      : null;
    if (scoped) return scoped;
    if (!scope.includeLegacy) return null;
    return await ctx.db
      .query("bulkTransformJobs")
      .withIndex("by_shop_and_dismissed_at", (q) =>
        q.eq("shopId", undefined).eq("dismissedAt", undefined),
      )
      .order("desc")
      .first();
  },
});

export const selectionOptions = query({
  args: { productIds: v.array(v.id("products")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const productIds = Array.from(new Set(args.productIds));
    if (productIds.length > MAX_PRODUCTS_PER_JOB) {
      throw new Error(
        `A bulk image operation can include at most ${MAX_PRODUCTS_PER_JOB} products.`,
      );
    }
    if (!productIds.length) {
      return {
        productCount: 0,
        unavailableProductCount: 0,
        positions: [],
      };
    }
    const scope = await getActiveShopScope(ctx, userId);
    const products = await Promise.all(productIds.map((id) => ctx.db.get(id)));
    const availableProducts = products.filter(
      (product): product is Doc<"products"> =>
        Boolean(product && shopMatchesScope(product, scope)),
    );
    const positions = new Map<
      number,
      {
        position: number;
        productCount: number;
        previews: Array<{
          productId: Id<"products">;
          productTitle: string;
          url: string;
        }>;
      }
    >();
    for (const product of availableProducts) {
      for (const image of eligibleShopifyImages(product.currentShopifyImages)) {
        const position = image.position + 1;
        if (position > MAX_BULK_TRANSFORM_IMAGE_POSITIONS) continue;
        const option = positions.get(position) ?? {
          position,
          productCount: 0,
          previews: [],
        };
        option.productCount += 1;
        if (option.previews.length < SELECTION_PREVIEW_SIZE) {
          option.previews.push({
            productId: product._id,
            productTitle: product.title,
            url: image.url,
          });
        }
        positions.set(position, option);
      }
    }
    return {
      productCount: productIds.length,
      unavailableProductCount: productIds.length - availableProducts.length,
      snapshotToken: bulkTransformSelectionSnapshot(availableProducts),
      positions: Array.from(positions.values()).sort(
        (a, b) => a.position - b.position,
      ),
    };
  },
});

export const list = query({
  args: {
    cursor: v.union(
      v.null(),
      v.object({
        createdAt: v.number(),
        excludedJobIds: v.array(v.id("bulkTransformJobs")),
      }),
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > BULK_HISTORY_MAX_PAGE_SIZE
    ) {
      throw new Error(
        `Bulk history page size must be an integer between 1 and ${BULK_HISTORY_MAX_PAGE_SIZE}.`,
      );
    }
    if (
      args.cursor &&
      (!Number.isFinite(args.cursor.createdAt) ||
        args.cursor.excludedJobIds.length > 500)
    ) {
      throw new Error("Bulk history cursor is invalid or too large.");
    }
    const scope = await getActiveShopScope(ctx, userId);
    const take = args.limit + (args.cursor?.excludedJobIds.length ?? 0) + 1;
    const groups = await Promise.all(
      shopIdsForScope(scope).map((shopId) =>
        ctx.db
          .query("bulkTransformJobs")
          .withIndex("by_shop_and_created_at", (q) => {
            const scoped = q.eq("shopId", shopId);
            return args.cursor
              ? scoped.lte("createdAt", args.cursor.createdAt)
              : scoped;
          })
          .order("desc")
          .take(take),
      ),
    );
    const excludedJobIds = new Set(args.cursor?.excludedJobIds ?? []);
    const merged = groups
      .flat()
      .filter(
        (job) =>
          !args.cursor ||
          job.createdAt !== args.cursor.createdAt ||
          !excludedJobIds.has(job._id),
      )
      .sort(
        (a, b) =>
          b.createdAt - a.createdAt || b._creationTime - a._creationTime,
      );
    const page = merged.slice(0, args.limit);
    const hasNext = merged.length > args.limit;
    const lastJob = page.at(-1);
    const inheritedExcludedIds =
      lastJob && args.cursor?.createdAt === lastJob.createdAt
        ? args.cursor.excludedJobIds
        : [];
    const continueCursor =
      hasNext && lastJob
        ? {
            createdAt: lastJob.createdAt,
            excludedJobIds: Array.from(
              new Set([
                ...inheritedExcludedIds,
                ...page
                  .filter((job) => job.createdAt === lastJob.createdAt)
                  .map((job) => job._id),
              ]),
            ),
          }
        : null;
    return {
      page: page.map((job) => ({
        _id: job._id,
        _creationTime: job._creationTime,
        operation: job.operation,
        status: job.status,
        productCount: job.productIds.length,
        selectedImagePositions: job.selectedImagePositions ?? null,
        seededProductCount: job.seededProductCount,
        seedFailedProducts: job.seedFailedProducts,
        totalItems: job.totalItems,
        transformedItems: job.transformedItems,
        transformFailedItems: job.transformFailedItems,
        publishedItems: job.publishedItems,
        publishFailedItems: job.publishFailedItems,
        conflictItems: job.conflictItems,
        skippedItems: job.skippedItems,
        unsupportedItems: job.unsupportedItems,
        error: job.error ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt ?? null,
        dismissedAt: job.dismissedAt ?? null,
        assetsCleanedAt: job.assetsCleanedAt ?? null,
      })),
      limit: args.limit,
      hasNext,
      continueCursor,
    };
  },
});

export const get = query({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) return null;
    const previewStatuses = [
      "ready",
      "published",
      "transforming",
      "publishing",
    ] as const;
    const errorStatuses = [
      "conflict",
      "transform_failed",
      "publish_failed",
      "skipped",
    ] as const;
    const [previewGroups, errorGroups, seedFailures] = await Promise.all([
      Promise.all(
        previewStatuses.map((status) =>
          ctx.db
            .query("bulkTransformItems")
            .withIndex("by_job_and_status", (q) =>
              q.eq("jobId", job._id).eq("status", status),
            )
            .order("asc")
            .take(PREVIEW_SAMPLE_SIZE),
        ),
      ),
      Promise.all(
        errorStatuses.map((status) =>
          ctx.db
            .query("bulkTransformItems")
            .withIndex("by_job_and_status", (q) =>
              q.eq("jobId", job._id).eq("status", status),
            )
            .order("desc")
            .take(ERROR_SAMPLE_SIZE),
        ),
      ),
      ctx.db
        .query("bulkTransformSeedFailures")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(ERROR_SAMPLE_SIZE),
    ]);
    function uniqueSample(
      groups: Doc<"bulkTransformItems">[][],
      limit: number,
    ) {
      const items: Doc<"bulkTransformItems">[] = [];
      const seen = new Set<Id<"bulkTransformItems">>();
      for (const group of groups) {
        for (const item of group) {
          if (seen.has(item._id)) continue;
          seen.add(item._id);
          items.push(item);
          if (items.length === limit) return items;
        }
      }
      return items;
    }
    const previewItems = uniqueSample(previewGroups, PREVIEW_SAMPLE_SIZE);
    const errorItems = uniqueSample(errorGroups, ERROR_SAMPLE_SIZE);
    const sampledItems = [...previewItems, ...errorItems];
    const products = await Promise.all(
      Array.from(
        new Set([
          ...sampledItems.map((item) => item.productId),
          ...seedFailures.map((failure) => failure.productId),
        ]),
      ).map((productId) => ctx.db.get(productId)),
    );
    const titles = new Map(
      products
        .filter((product): product is Doc<"products"> => Boolean(product))
        .map((product) => [product._id, product.title]),
    );
    const assetsUnavailable = Boolean(
      job.assetsCleanupStartedAt || job.assetsCleanedAt,
    );
    const enrich = (item: Doc<"bulkTransformItems">) => ({
      ...item,
      ...(assetsUnavailable ? { sourceBackupUrl: null, outputUrl: null } : {}),
      productTitle: titles.get(item.productId) ?? "Produit Shopify",
      referencedProductCount: item.referencedProductIds.length,
    });
    return {
      job,
      previewItems: previewItems.map(enrich),
      errorItems: errorItems.map(enrich),
      productErrors: seedFailures.map((failure) => ({
        ...failure,
        productTitle:
          titles.get(failure.productId) ?? "Produit Shopify supprimé",
      })),
    };
  },
});

export const retryFailures = action({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args): Promise<{ phase: BulkTransformRetryPhase }> => {
    const userId = await requireUserId(ctx);
    const job = (await ctx.runQuery(internal.bulkTransforms.getJobForUser, {
      jobId: args.jobId,
      userId,
    })) as Doc<"bulkTransformJobs"> | null;
    if (!job) throw new Error("Bulk transform job not found.");
    if (
      job.dismissedAt ||
      job.status === "cancelled" ||
      job.assetsCleanupStartedAt ||
      job.assetsCleanedAt
    ) {
      throw new Error("This bulk operation can no longer be retried.");
    }
    if (!bulkTransformJobIsTerminal(job.status) && job.status !== "ready") {
      throw new Error("Wait for the current bulk operation to finish.");
    }
    const phase = retryPhaseForJob(job);
    if (!phase) {
      throw new Error("This bulk operation has no failed images to retry.");
    }
    if (phase === "publish") {
      const credentials = (await ctx.runQuery(
        internal.shops.getShopifyCredentials,
        {
          shopId: job.shopId ?? null,
          ...(job.shopId ? { userId } : {}),
        },
      )) as ShopifyCredentials;
      await requireWriteFilesScope(credentials);
    }
    return await ctx.runMutation(internal.bulkTransforms.prepareRetry, {
      jobId: job._id,
      userId,
      expectedPhase: phase,
    });
  },
});

export const prepareRetry = internalMutation({
  args: {
    jobId: v.id("bulkTransformJobs"),
    userId: v.id("users"),
    expectedPhase: v.union(
      v.literal("transform"),
      v.literal("publish"),
      v.literal("conflict"),
    ),
  },
  handler: async (ctx, args) => {
    const job = await jobForUser(ctx, args.jobId, args.userId);
    if (!job) throw new Error("Bulk transform job not found.");
    if (job.dismissedAt) {
      throw new Error("A dismissed bulk operation cannot be retried.");
    }
    if (
      job.status === "cancelled" ||
      job.assetsCleanupStartedAt ||
      job.assetsCleanedAt
    ) {
      throw new Error("This bulk operation can no longer be retried.");
    }
    if (!bulkTransformJobIsTerminal(job.status) && job.status !== "ready") {
      throw new Error("Wait for the current bulk operation to finish.");
    }
    const phase = retryPhaseForJob(job);
    if (!phase || phase !== args.expectedPhase) {
      throw new Error("The bulk retry state changed. Reload and try again.");
    }
    const scope = await getActiveShopScope(ctx, args.userId);
    await assertNoOtherActiveJob(ctx, scope, job._id);
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: phase === "publish" ? "publishing" : "transforming",
      retryPhase: phase,
      completedAt: undefined,
      readyAt: phase === "publish" ? job.readyAt : undefined,
      error: null,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bulkTransforms.resetFailures, {
      jobId: job._id,
      phase,
    });
    return { phase };
  },
});

export const dismiss = mutation({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) throw new Error("Bulk transform job not found.");
    if (!bulkTransformJobIsTerminal(job.status)) {
      throw new Error("An active bulk operation cannot be dismissed.");
    }
    const now = Date.now();
    await ctx.db.patch(job._id, { dismissedAt: now, updatedAt: now });
    return job._id;
  },
});

export const cancel = mutation({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await jobForUser(ctx, args.jobId, userId);
    if (!job) throw new Error("Bulk transform job not found.");
    if (
      job.status !== "queued" &&
      job.status !== "transforming" &&
      job.status !== "ready"
    ) {
      throw new Error("This bulk operation can no longer be cancelled safely.");
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "cancelled",
      retryPhase: undefined,
      completedAt: now,
      error: null,
      updatedAt: now,
    });
    return job._id;
  },
});

export const getJobForUser = internalQuery({
  args: {
    jobId: v.id("bulkTransformJobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await jobForUser(ctx, args.jobId, args.userId);
  },
});

export const createJob = internalMutation({
  args: {
    userId: v.id("users"),
    productIds: v.array(v.id("products")),
    operation: v.literal(BULK_TRANSFORM_OPERATION),
    imagePositions: v.optional(v.array(v.number())),
    selectionSnapshotToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"bulkTransformJobs">> => {
    const productIds = Array.from(new Set(args.productIds));
    const selectedImagePositions = normalizeBulkTransformImagePositions(
      args.imagePositions,
    );
    if (!productIds.length) throw new Error("Select at least one product.");
    if (productIds.length > MAX_PRODUCTS_PER_JOB) {
      throw new Error(
        `A bulk image operation can include at most ${MAX_PRODUCTS_PER_JOB} products.`,
      );
    }
    if (selectedImagePositions && !args.selectionSnapshotToken) {
      throw new Error(
        "Review the Shopify image positions before starting this bulk operation.",
      );
    }

    const shop = await ensureActiveShop(ctx, args.userId);
    const scope = await getActiveShopScope(ctx, args.userId);
    await assertNoOtherActiveJob(ctx, scope);

    const products = await Promise.all(productIds.map((id) => ctx.db.get(id)));
    if (products.some((product) => !product)) {
      throw new Error("One or more selected products no longer exist.");
    }
    const selectedProducts = products as Doc<"products">[];
    if (selectedProducts.some((product) => !shopMatchesScope(product, scope))) {
      throw new Error("Selected products must belong to the active shop.");
    }
    if (
      args.selectionSnapshotToken &&
      args.selectionSnapshotToken !==
        bulkTransformSelectionSnapshot(selectedProducts)
    ) {
      throw new Error(
        "The selected Shopify images changed while the bulk dialog was open. Review the image positions and try again.",
      );
    }
    const selectionProductHashes = selectedProducts.map((product) =>
      bulkTransformMediaIdFingerprint(
        selectedCachedShopifyMediaIds(
          product.currentShopifyImages,
          selectedImagePositions,
        ),
      ),
    );
    for (const product of selectedProducts) {
      if (!product.shopId) {
        await ctx.db.patch(product._id, {
          shopId: shop._id,
          updatedAt: Date.now(),
        });
      }
    }

    const estimatedMediaIds = new Set(
      selectedProducts.flatMap((product) =>
        eligibleShopifyImages(product.currentShopifyImages)
          .filter((image) =>
            bulkTransformImagePositionIsSelected(
              selectedImagePositions,
              image.position + 1,
            ),
          )
          .map((image) => image.mediaId),
      ),
    );
    const now = Date.now();
    const jobId = await ctx.db.insert("bulkTransformJobs", {
      shopId: shop._id,
      createdByUserId: args.userId,
      operation: args.operation,
      status: "queued",
      productIds,
      ...(selectedImagePositions ? { selectedImagePositions } : {}),
      ...(selectedImagePositions ? { selectionProductHashes } : {}),
      seededProductCount: 0,
      seedAttempts: 0,
      seedFailedProducts: 0,
      seededItems: 0,
      totalItems: estimatedMediaIds.size,
      transformedItems: 0,
      transformFailedItems: 0,
      publishedItems: 0,
      publishFailedItems: 0,
      conflictItems: 0,
      skippedItems: 0,
      unsupportedItems: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.bulkTransformsNode.seedNextProduct,
      { jobId },
    );
    return jobId;
  },
});

export const getSeedContext = internalQuery({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "queued") return null;
    const productId = job.productIds[job.seededProductCount];
    if (!productId) return { job, product: null, productIndex: null };
    const product = await ctx.db.get(productId);
    return { job, product, productIndex: job.seededProductCount };
  },
});

async function advanceSeedCursor(
  ctx: MutationCtx,
  job: Doc<"bulkTransformJobs">,
  args: {
    inserted: number;
    skippedItems: number;
    failedProducts: number;
  },
) {
  const seededProductCount = job.seededProductCount + 1;
  const seededItems = job.seededItems + args.inserted;
  const skippedItems = job.skippedItems + args.skippedItems;
  const seedFailedProducts = job.seedFailedProducts + args.failedProducts;
  const finishedSeeding = seededProductCount >= job.productIds.length;
  const now = Date.now();
  await ctx.db.patch(job._id, {
    seededProductCount,
    seedAttempts: 0,
    seedFailedProducts,
    seededItems,
    skippedItems,
    totalItems: finishedSeeding ? seededItems : job.totalItems,
    ...(finishedSeeding
      ? seededItems > 0
        ? {
            status: "transforming" as const,
            startedAt: now,
            error: null,
          }
        : {
            status: "failed" as const,
            completedAt: now,
            error:
              seedFailedProducts > 0
                ? `No READY Shopify images were found; ${seedFailedProducts} product${seedFailedProducts === 1 ? "" : "s"} could not be read.`
                : job.selectedImagePositions
                  ? `No READY Shopify images were found at the selected position${job.selectedImagePositions.length === 1 ? "" : "s"}: ${job.selectedImagePositions.join(", ")}.`
                  : "No READY Shopify images were found.",
          }
      : {}),
    updatedAt: now,
  });
  if (!finishedSeeding) {
    await ctx.scheduler.runAfter(
      0,
      internal.bulkTransformsNode.seedNextProduct,
      { jobId: job._id },
    );
  } else if (seededItems > 0) {
    await ctx.scheduler.runAfter(0, internal.bulkTransformsNode.transformNext, {
      jobId: job._id,
    });
  }
}

export const storeSeededProduct = internalMutation({
  args: {
    jobId: v.id("bulkTransformJobs"),
    productIndex: v.number(),
    skippedItems: v.number(),
    images: v.array(
      v.object({
        mediaId: v.string(),
        url: v.string(),
        altText: v.union(v.string(), v.null()),
        position: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.status !== "queued" ||
      job.seededProductCount !== args.productIndex
    ) {
      return null;
    }
    const productId = job.productIds[args.productIndex];
    if (!productId) return null;
    let inserted = 0;
    const now = Date.now();
    for (const image of args.images) {
      const existing = await ctx.db
        .query("bulkTransformItems")
        .withIndex("by_job_and_source_media_id", (q) =>
          q.eq("jobId", job._id).eq("sourceMediaId", image.mediaId),
        )
        .first();
      if (existing) {
        if (!existing.referencedProductIds.includes(productId)) {
          await ctx.db.patch(existing._id, {
            referencedProductIds: [...existing.referencedProductIds, productId],
            updatedAt: now,
          });
        }
        continue;
      }
      await ctx.db.insert("bulkTransformItems", {
        ...(job.shopId ? { shopId: job.shopId } : {}),
        jobId: job._id,
        productId,
        referencedProductIds: [productId],
        operation: job.operation,
        sourceMediaId: image.mediaId,
        sourceUrl: image.url,
        sourceAlt: image.altText,
        sourcePosition: image.position,
        sourceSha256: null,
        transformedSha256: null,
        sourceBackupUrl: null,
        outputUrl: null,
        publishedUrl: null,
        status: "queued",
        error: null,
        attempts: 0,
        publishAttempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    await advanceSeedCursor(ctx, job, {
      inserted,
      skippedItems: args.skippedItems,
      failedProducts: 0,
    });
    return { inserted };
  },
});

export const recordSeedFailure = internalMutation({
  args: {
    jobId: v.id("bulkTransformJobs"),
    productIndex: v.number(),
    error: v.string(),
    retryable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.status !== "queued" ||
      job.seededProductCount !== args.productIndex
    ) {
      return null;
    }
    const nextAttempt = job.seedAttempts + 1;
    if (args.retryable !== false && nextAttempt < MAX_SEED_ATTEMPTS) {
      const now = Date.now();
      await ctx.db.patch(job._id, {
        seedAttempts: nextAttempt,
        error: args.error,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        1_000 * 2 ** (nextAttempt - 1),
        internal.bulkTransformsNode.seedNextProduct,
        { jobId: job._id },
      );
      return { retrying: true };
    }
    const productId = job.productIds[args.productIndex];
    if (!productId) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("bulkTransformSeedFailures")
      .withIndex("by_job_and_product", (q) =>
        q.eq("jobId", job._id).eq("productId", productId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        error: args.error,
        attempts: nextAttempt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("bulkTransformSeedFailures", {
        ...(job.shopId ? { shopId: job.shopId } : {}),
        jobId: job._id,
        productId,
        error: args.error,
        attempts: nextAttempt,
        createdAt: now,
        updatedAt: now,
      });
    }
    await advanceSeedCursor(ctx, job, {
      inserted: 0,
      skippedItems: 0,
      failedProducts: 1,
    });
    return { retrying: false };
  },
});

export const claimNextTransform = internalMutation({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "transforming") return null;
    const item = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "queued"),
      )
      .order("asc")
      .first();
    if (!item) return null;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      status: "transforming",
      processingStartedAt: now,
      attempts: item.attempts + 1,
      error: null,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { updatedAt: now });
    return {
      ...item,
      status: "transforming" as const,
      attempts: item.attempts + 1,
    };
  },
});

async function finishTransform(
  ctx: MutationCtx,
  args: {
    itemId: Id<"bulkTransformItems">;
    sourceUrl?: string;
    sourceSha256?: string;
    transformedSha256?: string;
    sourceBackupUrl?: string;
    outputUrl?: string;
    error?: string;
    skipped?: boolean;
  },
) {
  const item = await ctx.db.get(args.itemId);
  if (!item || item.status !== "transforming") return null;
  const job = await ctx.db.get(item.jobId);
  if (!job || job.status !== "transforming") return null;
  const succeeded = Boolean(
    args.sourceSha256 && args.transformedSha256 && args.outputUrl,
  );
  const skipped = !succeeded && args.skipped === true;
  const transformedItems = job.transformedItems + (succeeded ? 1 : 0);
  const transformFailedItems =
    job.transformFailedItems + (!succeeded && !skipped ? 1 : 0);
  const unsupportedItems = job.unsupportedItems + (skipped ? 1 : 0);
  const done =
    transformedItems + transformFailedItems + unsupportedItems >=
    job.totalItems;
  const now = Date.now();
  await ctx.db.patch(item._id, {
    status: succeeded ? "ready" : skipped ? "skipped" : "transform_failed",
    sourceUrl: args.sourceUrl ?? item.sourceUrl,
    sourceSha256: args.sourceSha256 ?? item.sourceSha256 ?? null,
    transformedSha256: args.transformedSha256 ?? item.transformedSha256 ?? null,
    sourceBackupUrl: args.sourceBackupUrl ?? item.sourceBackupUrl ?? null,
    outputUrl: args.outputUrl ?? item.outputUrl ?? null,
    processingStartedAt: undefined,
    error: args.error ?? null,
    updatedAt: now,
  });
  await ctx.db.patch(job._id, {
    transformedItems,
    transformFailedItems,
    unsupportedItems,
    ...(done
      ? {
          status:
            transformedItems > 0 ? ("ready" as const) : ("failed" as const),
          readyAt: transformedItems > 0 ? now : undefined,
          completedAt: transformedItems > 0 ? undefined : now,
          error:
            transformedItems > 0
              ? null
              : unsupportedItems > 0 && transformFailedItems === 0
                ? "Every image was skipped because its format is unsupported."
                : "Every image transformation failed.",
        }
      : {}),
    updatedAt: now,
  });
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.bulkTransformsNode.transformNext, {
      jobId: job._id,
    });
  }
  return { done };
}

export const markTransformReady = internalMutation({
  args: {
    itemId: v.id("bulkTransformItems"),
    sourceUrl: v.string(),
    sourceSha256: v.string(),
    transformedSha256: v.string(),
    sourceBackupUrl: v.string(),
    outputUrl: v.string(),
  },
  handler: async (ctx, args) => await finishTransform(ctx, args),
});

export const markTransformFailed = internalMutation({
  args: { itemId: v.id("bulkTransformItems"), error: v.string() },
  handler: async (ctx, args) => await finishTransform(ctx, args),
});

export const markTransformSkipped = internalMutation({
  args: { itemId: v.id("bulkTransformItems"), error: v.string() },
  handler: async (ctx, args) =>
    await finishTransform(ctx, { ...args, skipped: true }),
});

export const startPublishing = internalMutation({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Bulk transform job not found.");
    if (job.status !== "ready" && job.status !== "partial") {
      throw new Error("This bulk operation is not ready to publish.");
    }
    const next = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "ready"),
      )
      .first();
    if (!next) throw new Error("No transformed images are ready to publish.");
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: "publishing",
      publishStartedAt: job.publishStartedAt ?? now,
      completedAt: undefined,
      error: null,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bulkTransformsNode.publishNext, {
      jobId: job._id,
    });
    return job._id;
  },
});

export const claimNextPublish = internalMutation({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "publishing") return null;
    const item = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "ready"),
      )
      .order("asc")
      .first();
    if (!item) return null;
    const now = Date.now();
    const publishAttempts = item.publishAttempts + 1;
    await ctx.db.patch(item._id, {
      status: "publishing",
      processingStartedAt: now,
      attempts: item.attempts + 1,
      publishAttempts,
      error: null,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { updatedAt: now });
    return {
      ...item,
      status: "publishing" as const,
      attempts: item.attempts + 1,
      publishAttempts,
    };
  },
});

export const getProcessingContext = internalQuery({
  args: { itemId: v.id("bulkTransformItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    const job = await ctx.db.get(item.jobId);
    if (!job) return null;
    return { item, job };
  },
});

export const markFileUpdateAccepted = internalMutation({
  args: { itemId: v.id("bulkTransformItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "publishing") return null;
    const job = await ctx.db.get(item.jobId);
    if (!job || job.status !== "publishing") return null;
    const now = Date.now();
    await ctx.db.patch(item._id, {
      fileUpdateAcceptedAt: now,
      updatedAt: now,
    });
    return now;
  },
});

export const clearFileUpdateAccepted = internalMutation({
  args: { itemId: v.id("bulkTransformItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || !item.fileUpdateAcceptedAt) return null;
    await ctx.db.patch(item._id, {
      fileUpdateAcceptedAt: undefined,
      updatedAt: Date.now(),
    });
    return item._id;
  },
});

async function finishPublish(
  ctx: MutationCtx,
  args: {
    itemId: Id<"bulkTransformItems">;
    publishedUrl?: string;
    error?: string;
    conflict?: boolean;
  },
) {
  const item = await ctx.db.get(args.itemId);
  if (!item || item.status !== "publishing") return null;
  const job = await ctx.db.get(item.jobId);
  if (!job || job.status !== "publishing") return null;
  const succeeded = Boolean(args.publishedUrl);
  const conflict = !succeeded && args.conflict === true;
  const publishedItems = job.publishedItems + (succeeded ? 1 : 0);
  const publishFailedItems =
    job.publishFailedItems + (!succeeded && !conflict ? 1 : 0);
  const conflictItems = job.conflictItems + (conflict ? 1 : 0);
  const processed = publishedItems + publishFailedItems + conflictItems;
  const done = processed >= job.transformedItems;
  const now = Date.now();
  await ctx.db.patch(item._id, {
    status: succeeded ? "published" : conflict ? "conflict" : "publish_failed",
    publishedUrl: args.publishedUrl ?? item.publishedUrl ?? null,
    fileUpdateAcceptedAt:
      succeeded || conflict ? undefined : item.fileUpdateAcceptedAt,
    processingStartedAt: undefined,
    error: args.error ?? null,
    updatedAt: now,
  });

  if (succeeded && args.publishedUrl) {
    await ctx.scheduler.runAfter(
      0,
      internal.bulkTransforms.refreshPublishedProductCaches,
      { itemId: item._id, nextProductIndex: 0 },
    );
  }

  const hasFailures =
    job.seedFailedProducts +
      job.skippedItems +
      job.transformFailedItems +
      job.unsupportedItems +
      publishFailedItems +
      conflictItems >
    0;
  await ctx.db.patch(job._id, {
    publishedItems,
    publishFailedItems,
    conflictItems,
    ...(done
      ? {
          status: hasFailures ? ("partial" as const) : ("completed" as const),
          completedAt: now,
          error: hasFailures
            ? "Some images could not be transformed or published."
            : null,
        }
      : {}),
    updatedAt: now,
  });
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.bulkTransformsNode.publishNext, {
      jobId: job._id,
    });
  }
  return { done };
}

export const markPublished = internalMutation({
  args: { itemId: v.id("bulkTransformItems"), publishedUrl: v.string() },
  handler: async (ctx, args) => await finishPublish(ctx, args),
});

export const refreshPublishedProductCaches = internalMutation({
  args: {
    itemId: v.id("bulkTransformItems"),
    nextProductIndex: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.nextProductIndex) || args.nextProductIndex < 0) {
      throw new Error("Published cache cursor must be a non-negative integer.");
    }
    const item = await ctx.db.get(args.itemId);
    if (!item || item.status !== "published" || !item.publishedUrl) {
      return null;
    }
    const endIndex = Math.min(
      item.referencedProductIds.length,
      args.nextProductIndex + PUBLISHED_CACHE_UPDATE_BATCH_SIZE,
    );
    const productIds = item.referencedProductIds.slice(
      args.nextProductIndex,
      endIndex,
    );
    const products = await Promise.all(
      productIds.map((productId) => ctx.db.get(productId)),
    );
    const displayUrl = item.transformedSha256
      ? cacheBustedShopifyImageUrl(item.publishedUrl, item.transformedSha256)
      : item.publishedUrl;
    const now = Date.now();
    let updatedProducts = 0;
    for (const product of products) {
      if (!product) continue;
      const cached = replaceCachedShopifyImageUrl({
        images: product.currentShopifyImages,
        mediaId: item.sourceMediaId,
        url: item.publishedUrl,
        displayUrl,
      });
      if (!cached.replaced) continue;
      const first = cached.images[0] as
        | { url?: string | null; displayUrl?: string | null }
        | undefined;
      await ctx.db.patch(product._id, {
        currentShopifyImages: cached.images,
        featuredImageUrl: first?.url ?? product.featuredImageUrl ?? null,
        updatedAt: now,
      });
      updatedProducts += 1;
    }
    const done = endIndex >= item.referencedProductIds.length;
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal.bulkTransforms.refreshPublishedProductCaches,
        { itemId: item._id, nextProductIndex: endIndex },
      );
    }
    return {
      updatedProducts,
      done,
      nextProductIndex: done ? null : endIndex,
    };
  },
});

export const markPublishFailed = internalMutation({
  args: {
    itemId: v.id("bulkTransformItems"),
    error: v.string(),
    conflict: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => await finishPublish(ctx, args),
});

export const resetFailures = internalMutation({
  args: {
    jobId: v.id("bulkTransformJobs"),
    phase: v.union(
      v.literal("transform"),
      v.literal("publish"),
      v.literal("conflict"),
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.retryPhase !== args.phase) return null;
    const failedStatus =
      args.phase === "transform"
        ? "transform_failed"
        : args.phase === "publish"
          ? "publish_failed"
          : "conflict";
    const nextStatus = args.phase === "publish" ? "ready" : "queued";
    const failed = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_job_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", failedStatus),
      )
      .take(RESET_BATCH_SIZE);
    const now = Date.now();
    for (const item of failed) {
      await ctx.db.patch(item._id, {
        status: nextStatus,
        ...(args.phase === "conflict"
          ? {
              sourceSha256: null,
              transformedSha256: null,
              sourceBackupUrl: null,
              outputUrl: null,
              publishedUrl: null,
              fileUpdateAcceptedAt: undefined,
            }
          : {}),
        processingStartedAt: undefined,
        error: null,
        updatedAt: now,
      });
    }
    await ctx.db.patch(job._id, {
      ...(args.phase === "transform"
        ? {
            transformFailedItems: Math.max(
              0,
              job.transformFailedItems - failed.length,
            ),
          }
        : args.phase === "publish"
          ? {
              publishFailedItems: Math.max(
                0,
                job.publishFailedItems - failed.length,
              ),
            }
          : {
              conflictItems: Math.max(0, job.conflictItems - failed.length),
              transformedItems: Math.max(
                0,
                job.transformedItems - failed.length,
              ),
            }),
      updatedAt: now,
    });
    if (failed.length === RESET_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.bulkTransforms.resetFailures, {
        jobId: job._id,
        phase: args.phase,
      });
    } else {
      await ctx.db.patch(job._id, {
        retryPhase: undefined,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        args.phase === "publish"
          ? internal.bulkTransformsNode.publishNext
          : internal.bulkTransformsNode.transformNext,
        { jobId: job._id },
      );
    }
    return { reset: failed.length };
  },
});

export const resumeStaleJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_PROCESSING_MS;
    const staleQueuedJobs = await ctx.db
      .query("bulkTransformJobs")
      .withIndex("by_status_and_updated_at", (q) =>
        q.eq("status", "queued").lte("updatedAt", cutoff),
      )
      .take(10);
    const staleTransformJobs = await ctx.db
      .query("bulkTransformJobs")
      .withIndex("by_status_and_updated_at", (q) =>
        q.eq("status", "transforming").lte("updatedAt", cutoff),
      )
      .take(10);
    const stalePublishJobs = await ctx.db
      .query("bulkTransformJobs")
      .withIndex("by_status_and_updated_at", (q) =>
        q.eq("status", "publishing").lte("updatedAt", cutoff),
      )
      .take(10);
    const staleTransforms = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_status_and_updated_at", (q) =>
        q.eq("status", "transforming").lte("updatedAt", cutoff),
      )
      .take(10);
    const stalePublishes = await ctx.db
      .query("bulkTransformItems")
      .withIndex("by_status_and_updated_at", (q) =>
        q.eq("status", "publishing").lte("updatedAt", cutoff),
      )
      .take(10);
    const resumeJobIds = new Set<Id<"bulkTransformJobs">>([
      ...staleQueuedJobs.map((job) => job._id),
      ...staleTransformJobs.map((job) => job._id),
      ...stalePublishJobs.map((job) => job._id),
    ]);
    for (const item of staleTransforms) {
      await ctx.db.patch(item._id, {
        status: "queued",
        processingStartedAt: undefined,
        updatedAt: Date.now(),
      });
      resumeJobIds.add(item.jobId);
    }
    for (const item of stalePublishes) {
      await ctx.db.patch(item._id, {
        status: "ready",
        processingStartedAt: undefined,
        updatedAt: Date.now(),
      });
      resumeJobIds.add(item.jobId);
    }
    const now = Date.now();
    let resumedSeeding = 0;
    let resumedTransforms = 0;
    let resumedPublishes = 0;
    let resumedResets = 0;
    for (const jobId of resumeJobIds) {
      const job = await ctx.db.get(jobId);
      if (!job) continue;
      const task = bulkTransformResumeTask(job);
      if (!task) continue;
      await ctx.db.patch(job._id, { updatedAt: now });
      if (task.kind === "reset") {
        resumedResets += 1;
        await ctx.scheduler.runAfter(0, internal.bulkTransforms.resetFailures, {
          jobId: job._id,
          phase: task.phase,
        });
      } else if (task.kind === "seed") {
        resumedSeeding += 1;
        await ctx.scheduler.runAfter(
          0,
          internal.bulkTransformsNode.seedNextProduct,
          { jobId: job._id },
        );
      } else if (task.kind === "transform") {
        resumedTransforms += 1;
        await ctx.scheduler.runAfter(
          0,
          internal.bulkTransformsNode.transformNext,
          { jobId: job._id },
        );
      } else {
        resumedPublishes += 1;
        await ctx.scheduler.runAfter(
          0,
          internal.bulkTransformsNode.publishNext,
          { jobId: job._id },
        );
      }
    }
    return {
      resumedSeeding,
      resumedTransforms,
      resumedPublishes,
      resumedResets,
    };
  },
});

export const listJobsForAssetCleanup = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - BULK_TRANSFORM_ASSET_RETENTION_MS;
    const terminalStatuses = [
      "completed",
      "partial",
      "failed",
      "cancelled",
    ] as const;
    const [terminalGroups, dismissed] = await Promise.all([
      Promise.all(
        terminalStatuses.map((status) =>
          ctx.db
            .query("bulkTransformJobs")
            .withIndex(
              "by_status_and_assets_cleaned_at_and_completed_at",
              (q) =>
                q
                  .eq("status", status)
                  .eq("assetsCleanedAt", undefined)
                  .lte("completedAt", cutoff),
            )
            .take(20),
        ),
      ),
      ctx.db
        .query("bulkTransformJobs")
        .withIndex("by_assets_cleaned_at_and_dismissed_at", (q) =>
          q.eq("assetsCleanedAt", undefined).lte("dismissedAt", cutoff),
        )
        .take(20),
    ]);
    const jobs = new Map<Id<"bulkTransformJobs">, Doc<"bulkTransformJobs">>();
    for (const job of [...terminalGroups.flat(), ...dismissed]) {
      jobs.set(job._id, job);
    }
    return Array.from(jobs.values()).slice(0, 20);
  },
});

export const markAssetsCleaned = internalMutation({
  args: {
    jobId: v.id("bulkTransformJobs"),
    cutoff: v.number(),
    leaseStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.assetsCleanedAt ||
      job.assetsCleanupStartedAt !== args.leaseStartedAt
    ) {
      return null;
    }
    const eligible =
      (bulkTransformJobIsTerminal(job.status) &&
        Boolean(job.completedAt && job.completedAt <= args.cutoff)) ||
      Boolean(job.dismissedAt && job.dismissedAt <= args.cutoff);
    if (!eligible) return null;
    const now = Date.now();
    await ctx.db.patch(job._id, {
      assetsCleanupStartedAt: undefined,
      assetsCleanedAt: now,
      updatedAt: now,
    });
    return job._id;
  },
});

export const claimAssetsCleanup = internalMutation({
  args: { jobId: v.id("bulkTransformJobs"), cutoff: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.assetsCleanedAt) return null;
    const eligible =
      (bulkTransformJobIsTerminal(job.status) &&
        Boolean(job.completedAt && job.completedAt <= args.cutoff)) ||
      Boolean(job.dismissedAt && job.dismissedAt <= args.cutoff);
    if (!eligible) return null;
    const now = Date.now();
    if (
      job.assetsCleanupStartedAt &&
      job.assetsCleanupStartedAt > now - ASSET_CLEANUP_LEASE_MS
    ) {
      return null;
    }
    await ctx.db.patch(job._id, {
      assetsCleanupStartedAt: now,
      updatedAt: now,
    });
    return { jobId: job._id, leaseStartedAt: now };
  },
});

export const isAssetsCleanupLeaseActive = internalQuery({
  args: {
    jobId: v.id("bulkTransformJobs"),
    leaseStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    return Boolean(
      job &&
      !job.assetsCleanedAt &&
      job.assetsCleanupStartedAt === args.leaseStartedAt,
    );
  },
});
