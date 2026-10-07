import {
  WorkflowManager,
  cleanup,
  start as startWorkflow,
  vResultValidator,
  vWorkflowId,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import {
  getActiveShopScope,
  shopMatchesScope,
  shopifyCredentialsForShop,
} from "./shopScope";
import { isApprovedUser } from "./userAccess";
import { imagePublishSummaryValidator } from "./shopify/publicationSchema";

const MAX_IMAGES = 1000;
const MAX_PRODUCTS = 500;
const MAX_PRODUCT_IMAGES = 250;
const MAX_ERROR_LENGTH = 1000;

// Shopify writes have their own receipt/lease fencing. A failed action must be
// reported to the operator rather than automatically replaying external IO.
const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 3, retryActionsByDefault: false },
});

export const start = mutation({
  args: {
    jobId: v.id("generationJobs"),
    imageIds: v.array(v.id("generatedImages")),
    replaceExisting: v.boolean(),
  },
  returns: v.id("imagePublishRuns"),
  handler: async (ctx, args): Promise<Id<"imagePublishRuns">> => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.isHidden ||
      job.deletedAt != null ||
      !shopMatchesScope(job, scope)
    )
      throw new Error("Job introuvable.");

    // The indexed read is part of this transaction, so simultaneous starts
    // cannot create two workers for the same job.
    const running = await ctx.db
      .query("imagePublishRuns")
      .withIndex("by_jobId_and_status", (q) =>
        q.eq("jobId", job._id).eq("status", "running"),
      )
      .first();
    if (running) return running._id;
    if (!args.imageIds.length || args.imageIds.length > MAX_IMAGES)
      throw new Error(
        `Sélectionnez entre 1 et ${MAX_IMAGES} images à publier.`,
      );
    const uniqueIds = [...new Set(args.imageIds)];
    if (uniqueIds.length !== args.imageIds.length)
      throw new Error("La sélection contient des images en double.");

    // Resolve and validate the shop now. Workers always use this shop even if
    // the initiating user switches their active shop while publication runs.
    const credentials = shopifyCredentialsForShop(scope.shop);
    const groups = new Map<
      Id<"products">,
      {
        product: Doc<"products">;
        images: Array<{ imageId: Id<"generatedImages">; storageUrl: string }>;
      }
    >();
    for (const imageId of uniqueIds) {
      const image = await ctx.db.get(imageId);
      if (
        !image ||
        image.jobId !== job._id ||
        !shopMatchesScope(image, scope) ||
        image.status !== "generated" ||
        image.reviewStatus !== "approved" ||
        !image.storageUrl ||
        image.shopifyMediaId ||
        image.pushRunId ||
        image.activeRetryImageId
      )
        throw new Error(
          "La sélection doit contenir uniquement des images approuvées, générées et non publiées de ce job.",
        );
      let group = groups.get(image.productId);
      if (!group) {
        const product = await ctx.db.get(image.productId);
        if (!product || !shopMatchesScope(product, scope))
          throw new Error(
            "Un produit de la sélection n’appartient plus à cette boutique.",
          );
        group = { product, images: [] };
        groups.set(image.productId, group);
      }
      group.images.push({ imageId, storageUrl: image.storageUrl });
      if (group.images.length > MAX_PRODUCT_IMAGES)
        throw new Error(
          `La publication accepte au maximum ${MAX_PRODUCT_IMAGES} images par produit.`,
        );
    }
    if (groups.size > MAX_PRODUCTS)
      throw new Error(
        `La publication accepte au maximum ${MAX_PRODUCTS} produits à la fois.`,
      );

    const now = Date.now();
    const runId = await ctx.db.insert("imagePublishRuns", {
      jobId: job._id,
      ...(scope.shopId ? { shopId: scope.shopId } : {}),
      shopDomain: credentials.domain,
      includeLegacy: scope.includeLegacy,
      createdByUserId: userId,
      status: "running",
      replaceExisting: args.replaceExisting,
      totalProducts: groups.size,
      processedProducts: 0,
      failedProducts: 0,
      totalImages: uniqueIds.length,
      pushedImages: 0,
      createdAt: now,
      updatedAt: now,
      tracksImageFeedback: true,
    });
    let position = 0;
    for (const { product, images } of groups.values()) {
      for (const selected of images) {
        await ctx.db.patch(selected.imageId, {
          pushRunId: runId,
          pushError: undefined,
          updatedAt: now,
        });
      }
      await ctx.db.insert("imagePublishProducts", {
        runId,
        productId: product._id,
        productTitle: product.title,
        images,
        position: position++,
        status: "queued",
        pushedImages: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    const workflowId = await startWorkflow(
      ctx,
      internal.jobImagePublishing.publishWorkflow,
      { runId },
      {
        onComplete: internal.jobImagePublishing.workflowCompleted,
        context: { runId },
        startAsync: true,
      },
    );
    await ctx.db.patch(runId, { workflowId });
    return runId;
  },
});

export const latest = query({
  args: { jobId: v.id("generationJobs") },
  returns: v.union(v.null(), imagePublishSummaryValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scope = await getActiveShopScope(ctx, userId);
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.isHidden ||
      job.deletedAt != null ||
      !shopMatchesScope(job, scope)
    )
      return null;
    const run = await ctx.db
      .query("imagePublishRuns")
      .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
      .order("desc")
      .first();
    if (!run) return null;
    const failures = await ctx.db
      .query("imagePublishProducts")
      .withIndex("by_runId_and_status", (q) =>
        q.eq("runId", run._id).eq("status", "failed"),
      )
      .take(MAX_PRODUCTS);
    const errors = failures.map((item) => ({
      productTitle: item.productTitle,
      error: item.error ?? "Publication échouée.",
    }));
    if (run.error)
      errors.push({ productTitle: "Publication", error: run.error });
    return {
      _id: run._id,
      status: run.status,
      totalProducts: run.totalProducts,
      processedProducts: run.processedProducts,
      failedProducts: run.failedProducts,
      totalImages: run.totalImages,
      pushedImages: run.pushedImages,
      replaceExisting: run.replaceExisting,
      errors,
    };
  },
});

export const nextProduct = internalQuery({
  args: { runId: v.id("imagePublishRuns"), afterPosition: v.number() },
  returns: v.union(
    v.null(),
    v.object({ itemId: v.id("imagePublishProducts"), position: v.number() }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return null;
    const item = await ctx.db
      .query("imagePublishProducts")
      .withIndex("by_runId_and_position", (q) =>
        q.eq("runId", run._id).gt("position", args.afterPosition),
      )
      .first();
    return item ? { itemId: item._id, position: item.position } : null;
  },
});

export const productForPush = internalQuery({
  args: { itemId: v.id("imagePublishProducts") },
  returns: v.object({
    userId: v.id("users"),
    runId: v.id("imagePublishRuns"),
    tracksImageFeedback: v.boolean(),
    productId: v.id("products"),
    shopId: v.union(v.id("shops"), v.null()),
    shopDomain: v.string(),
    replaceExisting: v.boolean(),
    images: v.array(
      v.object({ imageId: v.id("generatedImages"), storageUrl: v.string() }),
    ),
  }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    const run = item ? await ctx.db.get(item.runId) : null;
    if (!item || !run || run.status !== "running" || item.status !== "queued")
      throw new Error("Cette publication n’est plus active.");
    if (!isApprovedUser(await ctx.db.get(run.createdByUserId)))
      throw new Error(
        "Le compte à l’origine de cette publication n’est plus autorisé.",
      );
    const product = await ctx.db.get(item.productId);
    if (
      !product ||
      (product.shopId !== run.shopId &&
        !(run.includeLegacy && product.shopId == null))
    )
      throw new Error(
        "Le produit n’appartient plus à la boutique de cette publication.",
      );
    return {
      userId: run.createdByUserId,
      runId: run._id,
      tracksImageFeedback: run.tracksImageFeedback ?? false,
      productId: item.productId,
      shopId: run.shopId ?? null,
      shopDomain: run.shopDomain,
      replaceExisting: run.replaceExisting,
      images: item.images,
    };
  },
});

async function settleSelectedImages(
  ctx: MutationCtx,
  item: Doc<"imagePublishProducts">,
  error?: string,
) {
  for (const selected of item.images) {
    const image = await ctx.db.get(selected.imageId);
    // A delayed callback from an older run must never clear a newer run's
    // queued feedback or replace its error.
    if (!image || image.pushRunId !== item.runId) continue;
    await ctx.db.patch(image._id, {
      pushRunId: undefined,
      pushError: error?.slice(0, MAX_ERROR_LENGTH),
      updatedAt: Date.now(),
    });
  }
}

export const recordProduct = internalMutation({
  args: {
    itemId: v.id("imagePublishProducts"),
    pushedImages: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    const run = item ? await ctx.db.get(item.runId) : null;
    if (!item || !run || item.status !== "queued" || run.status !== "running")
      return null;
    const failed = args.error !== undefined;
    let pushedImages = args.pushedImages ?? 0;
    if (failed) {
      // Shopify can accept some images before a later association/deletion
      // fails. Count persisted uploads without erasing the product error.
      for (const selected of item.images) {
        const image = await ctx.db.get(selected.imageId);
        if (
          image?.storageUrl === selected.storageUrl &&
          image.status === "uploaded" &&
          image.shopifyMediaId
        )
          pushedImages++;
      }
    }
    pushedImages = Math.max(
      0,
      Math.min(item.images.length, Math.floor(pushedImages)),
    );
    await settleSelectedImages(
      ctx,
      item,
      failed ? args.error || "Publication échouée." : undefined,
    );
    const now = Date.now();
    await ctx.db.patch(item._id, {
      status: failed ? "failed" : "completed",
      pushedImages,
      ...(failed
        ? {
            error: (args.error || "Publication échouée.").slice(
              0,
              MAX_ERROR_LENGTH,
            ),
          }
        : {}),
      updatedAt: now,
    });
    await ctx.db.patch(run._id, {
      processedProducts: run.processedProducts + 1,
      failedProducts: run.failedProducts + (failed ? 1 : 0),
      pushedImages: run.pushedImages + pushedImages,
      updatedAt: now,
    });
    return null;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("imagePublishRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return null;
    if (run.processedProducts !== run.totalProducts)
      throw new Error(
        "La publication contient encore des produits non traités.",
      );
    await ctx.db.patch(run._id, {
      status: run.failedProducts ? "completed_with_errors" : "completed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const publishWorkflow = workflow
  .define({
    args: { runId: v.id("imagePublishRuns") },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    let afterPosition = -1;
    while (true) {
      const next: {
        itemId: Id<"imagePublishProducts">;
        position: number;
      } | null = await step.runQuery(internal.jobImagePublishing.nextProduct, {
        runId: args.runId,
        afterPosition,
      });
      if (!next) break;
      try {
        const result: { pushed: number } = await step.runAction(
          internal.shopify.pushJobProductImages,
          {
            itemId: next.itemId,
          },
          { retry: false },
        );
        await step.runMutation(internal.jobImagePublishing.recordProduct, {
          itemId: next.itemId,
          pushedImages: result.pushed,
        });
      } catch (error) {
        await step.runMutation(internal.jobImagePublishing.recordProduct, {
          itemId: next.itemId,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            MAX_ERROR_LENGTH,
          ),
        });
      }
      afterPosition = next.position;
    }
    await step.runMutation(internal.jobImagePublishing.finish, args);
    return null;
  });

export const workflowCompleted = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id("imagePublishRuns") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.context.runId);
    if (run?.workflowId === args.workflowId && run.status === "running") {
      await ctx.db.patch(run._id, {
        status: "failed",
        error: (args.result.kind === "failed"
          ? args.result.error
          : "La publication a été interrompue."
        ).slice(0, MAX_ERROR_LENGTH),
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.jobImagePublishing.settleInterruptedProducts,
        {
          runId: run._id,
        },
      );
    }
    await ctx.scheduler.runAfter(
      7 * 24 * 60 * 60_000,
      internal.jobImagePublishing.cleanupWorkflow,
      {
        workflowId: args.workflowId,
      },
    );
    return null;
  },
});

// Each product snapshot contains at most 250 images. Process one at a time so
// interruption cleanup stays bounded even for a large publication run.
export const settleInterruptedProducts = internalMutation({
  args: { runId: v.id("imagePublishRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "failed") return null;
    const item = await ctx.db
      .query("imagePublishProducts")
      .withIndex("by_runId_and_status", (q) =>
        q.eq("runId", run._id).eq("status", "queued"),
      )
      .first();
    if (!item) return null;
    const error = run.error || "La publication a été interrompue.";
    let pushedImages = 0;
    for (const selected of item.images) {
      const image = await ctx.db.get(selected.imageId);
      if (
        image?.storageUrl === selected.storageUrl &&
        image.status === "uploaded" &&
        image.shopifyMediaId
      )
        pushedImages++;
    }
    await settleSelectedImages(ctx, item, error);
    await ctx.db.patch(item._id, {
      status: "failed",
      error,
      pushedImages,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(run._id, {
      processedProducts: run.processedProducts + 1,
      failedProducts: run.failedProducts + 1,
      pushedImages: run.pushedImages + pushedImages,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      0,
      internal.jobImagePublishing.settleInterruptedProducts,
      args,
    );
    return null;
  },
});

export const cleanupWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cleanup(ctx, components.workflow, args.workflowId);
    return null;
  },
});
