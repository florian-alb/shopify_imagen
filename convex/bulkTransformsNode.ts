"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  flipImageHorizontally,
  imageSha256,
  UnsupportedAnimatedImageError,
} from "./bulkTransforms/image";
import {
  BULK_TRANSFORM_ASSET_RETENTION_MS,
  BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS,
  bulkTransformCanCompletePublication,
  bulkTransformMediaIdFingerprint,
  bulkTransformOwnsFailedUpdate,
  classifyBulkTransformSource,
  selectedCachedShopifyMediaIds,
  selectedBulkTransformImageNodes,
} from "./bulkTransforms/model";
import { mimeToExtension } from "./generation/formats";
import { deleteR2ObjectsWithPrefix, uploadToR2 } from "./generation/storage";
import type { ShopifyCredentials } from "./shopScope";
import { getAccessToken, shopifyGraphql } from "./shopify/client";
import {
  FILE_ACKNOWLEDGE_UPDATE_FAILED_MUTATION,
  FILE_UPDATE_MUTATION,
  MEDIA_IMAGE_FILE_STATUS_QUERY,
  PRODUCT_MEDIA_FILE_STATUS_QUERY,
} from "./shopify/graphql";
import { throwUserErrors } from "./shopify/media";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MEDIA_POLL_ATTEMPTS = 30;
const MEDIA_POLL_INTERVAL_MS = 2_000;

type MediaImageNode = {
  id: string;
  alt?: string | null;
  mediaContentType: string;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | string;
  fileStatus?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | string;
  image?: { url?: string | null; altText?: string | null } | null;
  originalSource?: { url?: string | null; fileSize?: number | null } | null;
};

type ProductMediaResponse = {
  product: {
    id: string;
    media: { nodes: MediaImageNode[] };
  } | null;
};

type MediaImageResponse = { node: MediaImageNode | null };

class SourceConflictError extends Error {}
class ShopifyFileUpdateFailedError extends Error {}

type CleanupJobAssetsResult = {
  cleaned: boolean;
  staleLease?: boolean;
  moreWork?: boolean;
  retrying?: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorWithCause(message: string, cause: unknown) {
  return Object.assign(new Error(message), { cause });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}).`);
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("The Shopify source is not an image file.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("The Shopify source image is empty.");
  if (bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("The Shopify source image exceeds the 25 MB bulk limit.");
  }
  return { bytes, contentType };
}

async function fetchProductMedia(args: {
  productId: string;
  accessToken: string;
  credentials: ShopifyCredentials;
}) {
  return await shopifyGraphql<ProductMediaResponse>(
    PRODUCT_MEDIA_FILE_STATUS_QUERY,
    { id: args.productId },
    args.accessToken,
    args.credentials,
  );
}

async function fetchMediaImage(args: {
  mediaId: string;
  accessToken: string;
  credentials: ShopifyCredentials;
}) {
  const data = await shopifyGraphql<MediaImageResponse>(
    MEDIA_IMAGE_FILE_STATUS_QUERY,
    { id: args.mediaId },
    args.accessToken,
    args.credentials,
  );
  return data.node?.mediaContentType === "IMAGE" ? data.node : null;
}

async function credentialsForJob(
  ctx: ActionCtx,
  job: Doc<"bulkTransformJobs">,
) {
  const credentials = (await ctx.runQuery(
    internal.shops.getShopifyCredentials,
    {
      shopId: job.shopId ?? null,
      ...(job.shopId ? { userId: job.createdByUserId } : {}),
    },
  )) as ShopifyCredentials;
  const accessToken = await getAccessToken(credentials);
  return { credentials, accessToken };
}

export const seedNextProduct = internalAction({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const context = (await ctx.runQuery(
      internal.bulkTransforms.getSeedContext,
      { jobId: args.jobId },
    )) as {
      job: Doc<"bulkTransformJobs">;
      product: Doc<"products"> | null;
      productIndex: number | null;
    } | null;
    if (!context || context.productIndex == null) return null;
    if (!context.product) {
      await ctx.runMutation(internal.bulkTransforms.recordSeedFailure, {
        jobId: context.job._id,
        productIndex: context.productIndex,
        error: "The selected product no longer exists in Convex.",
        retryable: false,
      });
      return null;
    }

    const cachedSelectionHash = bulkTransformMediaIdFingerprint(
      selectedCachedShopifyMediaIds(
        context.product.currentShopifyImages,
        context.job.selectedImagePositions,
      ),
    );
    const expectedSelectionHash =
      context.job.selectionProductHashes?.[context.productIndex];
    if (context.job.selectedImagePositions && !expectedSelectionHash) {
      await ctx.runMutation(internal.bulkTransforms.recordSeedFailure, {
        jobId: context.job._id,
        productIndex: context.productIndex,
        error:
          "This position-based bulk predates safe image snapshots. Start a new bulk and review the positions again.",
        retryable: false,
      });
      return null;
    }
    if (
      expectedSelectionHash &&
      expectedSelectionHash !== cachedSelectionHash
    ) {
      await ctx.runMutation(internal.bulkTransforms.recordSeedFailure, {
        jobId: context.job._id,
        productIndex: context.productIndex,
        error:
          "The cached Shopify image order changed after selection. Start a new bulk and review the positions again.",
        retryable: false,
      });
      return null;
    }

    try {
      const { credentials, accessToken } = await credentialsForJob(
        ctx,
        context.job,
      );
      const data = await fetchProductMedia({
        productId: context.product.shopifyProductId,
        accessToken,
        credentials,
      });
      if (!data.product)
        throw new Error("Product no longer exists in Shopify.");
      const selectedImages = selectedBulkTransformImageNodes(
        data.product.media.nodes,
        context.job.selectedImagePositions,
      );
      if (
        expectedSelectionHash &&
        bulkTransformMediaIdFingerprint(
          selectedImages.map(({ media }) => media.id),
        ) !== expectedSelectionHash
      ) {
        await ctx.runMutation(internal.bulkTransforms.recordSeedFailure, {
          jobId: context.job._id,
          productIndex: context.productIndex,
          error:
            "The live Shopify image order changed after selection. No image from this product was transformed.",
          retryable: false,
        });
        return null;
      }
      const images = selectedImages.flatMap(({ media, position }) => {
        const url = media.image?.url?.trim();
        if (
          media.status !== "READY" ||
          media.fileStatus !== "READY" ||
          !url?.startsWith("http")
        ) {
          return [];
        }
        return [
          {
            mediaId: media.id,
            url,
            altText: media.image?.altText?.trim() || media.alt?.trim() || null,
            position,
          },
        ];
      });
      await ctx.runMutation(internal.bulkTransforms.storeSeededProduct, {
        jobId: context.job._id,
        productIndex: context.productIndex,
        skippedItems: selectedImages.length - images.length,
        images,
      });
    } catch (error) {
      await ctx.runMutation(internal.bulkTransforms.recordSeedFailure, {
        jobId: context.job._id,
        productIndex: context.productIndex,
        error: errorMessage(error),
      });
    }
    return null;
  },
});

export const transformNext = internalAction({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const item = (await ctx.runMutation(
      internal.bulkTransforms.claimNextTransform,
      { jobId: args.jobId },
    )) as Doc<"bulkTransformItems"> | null;
    if (!item) return null;
    try {
      const context = (await ctx.runQuery(
        internal.bulkTransforms.getProcessingContext,
        { itemId: item._id },
      )) as {
        item: Doc<"bulkTransformItems">;
        job: Doc<"bulkTransformJobs">;
      } | null;
      if (!context) throw new Error("Bulk transform context was not found.");
      const { credentials, accessToken } = await credentialsForJob(
        ctx,
        context.job,
      );
      const media = await fetchMediaImage({
        mediaId: item.sourceMediaId,
        accessToken,
        credentials,
      });
      if (!media) throw new Error("The Shopify image no longer exists.");
      if (media.status !== "READY" || media.fileStatus !== "READY") {
        throw new Error("The Shopify image is not READY.");
      }
      const originalUrl = media.originalSource?.url;
      if (!originalUrl)
        throw new Error("Shopify did not return the image source.");
      const original = await downloadImage(originalUrl);
      const sourceSha256 = imageSha256(original.bytes);
      const transformedBytes = await flipImageHorizontally(original.bytes);
      const transformedSha256 = imageSha256(transformedBytes);
      const prefix = `bulk-transforms/${context.job._id}/${sourceSha256}`;
      const sourceBackupUrl = await uploadToR2({
        bytes: original.bytes,
        contentType: original.contentType,
        key: `${prefix}/source.${mimeToExtension(original.contentType)}`,
      });
      const outputUrl = await uploadToR2({
        bytes: transformedBytes,
        contentType: "image/webp",
        key: `${prefix}/flip-horizontal-${transformedSha256}.webp`,
      });
      await ctx.runMutation(internal.bulkTransforms.markTransformReady, {
        itemId: item._id,
        sourceUrl: media.image?.url ?? item.sourceUrl,
        sourceSha256,
        transformedSha256,
        sourceBackupUrl,
        outputUrl,
      });
    } catch (error) {
      const mutation =
        error instanceof UnsupportedAnimatedImageError
          ? internal.bulkTransforms.markTransformSkipped
          : internal.bulkTransforms.markTransformFailed;
      await ctx.runMutation(mutation, {
        itemId: item._id,
        error: errorMessage(error),
      });
    }
    return null;
  },
});

async function waitForUpdatedImage(args: {
  mediaId: string;
  transformedSha256: string;
  accessToken: string;
  credentials: ShopifyCredentials;
}) {
  await delay(MEDIA_POLL_INTERVAL_MS);
  for (let attempt = 0; attempt < MEDIA_POLL_ATTEMPTS; attempt += 1) {
    const media = await fetchMediaImage(args);
    if (!media) throw new Error("The updated Shopify image disappeared.");
    if (media.fileStatus === "FAILED" || media.status === "FAILED") {
      throw new ShopifyFileUpdateFailedError(
        "Shopify failed to process the updated image.",
      );
    }
    if (media.fileStatus === "READY" && media.status === "READY") {
      const originalUrl = media.originalSource?.url;
      if (originalUrl) {
        const current = await downloadImage(originalUrl);
        if (imageSha256(current.bytes) === args.transformedSha256) return media;
      }
    }
    await delay(Math.min(5_000, MEDIA_POLL_INTERVAL_MS + attempt * 250));
  }
  throw new Error("Shopify image processing timed out before verification.");
}

async function acknowledgeFailedUpdate(args: {
  mediaId: string;
  accessToken: string;
  credentials: ShopifyCredentials;
}) {
  const acknowledged = await shopifyGraphql<{
    fileAcknowledgeUpdateFailed: {
      files: Array<{ id: string; fileStatus: string }> | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    FILE_ACKNOWLEDGE_UPDATE_FAILED_MUTATION,
    { fileIds: [args.mediaId] },
    args.accessToken,
    args.credentials,
  );
  throwUserErrors(
    acknowledged.fileAcknowledgeUpdateFailed.userErrors,
    "Shopify file failure acknowledgement failed",
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const media = await fetchMediaImage(args);
    if (!media) throw new Error("The Shopify image no longer exists.");
    if (media.fileStatus === "READY" && media.status === "READY") {
      return media;
    }
    await delay(1_000);
  }
  throw new Error("Shopify did not restore the previous image after failure.");
}

export const publishNext = internalAction({
  args: { jobId: v.id("bulkTransformJobs") },
  handler: async (ctx, args) => {
    const item = (await ctx.runMutation(
      internal.bulkTransforms.claimNextPublish,
      { jobId: args.jobId },
    )) as Doc<"bulkTransformItems"> | null;
    if (!item) return null;
    const leaseToken = item.publishLeaseToken;
    if (!leaseToken) {
      throw new Error("Claimed bulk publication is missing its media lease token.");
    }
    let conflict = false;
    let mutationAttempted = false;
    let leaseProtectedMutationAttempted = false;
    let updateAcceptedByShopify = false;
    let fileUpdateAcceptedAt = item.fileUpdateAcceptedAt;
    let safeToRelease = !item.publishRecoveryPending;
    let recoverySourceRestored = false;
    let recoveryContext: {
      accessToken: string;
      credentials: ShopifyCredentials;
    } | null = null;
    const renewMediaLease = async () => {
      const renewed = await ctx.runMutation(
        internal.bulkTransforms.renewPublishMediaLease,
        { itemId: item._id, leaseToken },
      );
      if (!renewed) {
        throw new SourceConflictError(
          "This publication attempt lost its Shopify media lease.",
        );
      }
      return renewed;
    };
    const acknowledgeOwnedFailedUpdate = async (
      accessToken: string,
      credentials: ShopifyCredentials,
    ) => {
      await renewMediaLease();
      safeToRelease = false;
      leaseProtectedMutationAttempted = true;
      const restored = await acknowledgeFailedUpdate({
        mediaId: item.sourceMediaId,
        accessToken,
        credentials,
      });
      recoverySourceRestored = true;
      safeToRelease = true;
      return restored;
    };
    try {
      const context = (await ctx.runQuery(
        internal.bulkTransforms.getProcessingContext,
        { itemId: item._id },
      )) as {
        item: Doc<"bulkTransformItems">;
        job: Doc<"bulkTransformJobs">;
      } | null;
      if (!context) throw new Error("Bulk publish context was not found.");
      if (!item.outputUrl || !item.sourceSha256 || !item.transformedSha256) {
        throw new Error("The transformed image is incomplete.");
      }
      const { credentials, accessToken } = await credentialsForJob(
        ctx,
        context.job,
      );
      recoveryContext = { credentials, accessToken };
      await renewMediaLease();
      let media = await fetchMediaImage({
        mediaId: item.sourceMediaId,
        accessToken,
        credentials,
      });
      if (!media) throw new Error("The Shopify image no longer exists.");
      if (media.fileStatus === "FAILED" || media.status === "FAILED") {
        if (
          !bulkTransformOwnsFailedUpdate({
            fileUpdateAcceptedAt,
            updateAcceptedByShopifyInCurrentRun: false,
          })
        ) {
          conflict = true;
          throw new SourceConflictError(
            "The Shopify image is FAILED because of an update outside this bulk. It was not acknowledged or overwritten.",
          );
        }
        await acknowledgeOwnedFailedUpdate(accessToken, credentials);
        await ctx.runMutation(internal.bulkTransforms.clearFileUpdateAccepted, {
          itemId: item._id,
          leaseToken,
        });
        fileUpdateAcceptedAt = undefined;
        media = await fetchMediaImage({
          mediaId: item.sourceMediaId,
          accessToken,
          credentials,
        });
        if (!media) throw new Error("The Shopify image no longer exists.");
      }
      const originalUrl = media.originalSource?.url;
      if (!originalUrl)
        throw new Error("Shopify did not return the image source.");
      const current = await downloadImage(originalUrl);
      const currentSha256 = imageSha256(current.bytes);
      const sourceState = classifyBulkTransformSource({
        currentSha256,
        sourceSha256: item.sourceSha256,
        transformedSha256: item.transformedSha256,
      });

      if (item.publishRecoveryPending && sourceState !== "transformed") {
        const settlementElapsed = Boolean(
          item.publishAmbiguousSince &&
            Date.now() - item.publishAmbiguousSince >=
              BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS,
        );
        if (!recoverySourceRestored && !settlementElapsed) {
          safeToRelease = false;
          throw new Error(
            "Shopify is still settling an earlier ambiguous file update.",
          );
        }
        safeToRelease = true;
        if (sourceState === "conflict") {
          conflict = true;
          throw new SourceConflictError(
            "The Shopify image changed while an earlier update was settling. It was not overwritten again.",
          );
        }
        throw new Error(
          "The earlier Shopify update did not apply after the settlement window.",
        );
      }

      if (sourceState === "transformed") {
        if (
          !bulkTransformCanCompletePublication({
            sourceState,
            fileStatus: media.fileStatus,
            mediaStatus: media.status,
          })
        ) {
          try {
            await renewMediaLease();
            media = await waitForUpdatedImage({
              mediaId: item.sourceMediaId,
              transformedSha256: item.transformedSha256,
              accessToken,
              credentials,
            });
          } catch (error) {
            if (error instanceof ShopifyFileUpdateFailedError) {
              if (
                !bulkTransformOwnsFailedUpdate({
                  fileUpdateAcceptedAt,
                  updateAcceptedByShopifyInCurrentRun: false,
                })
              ) {
                conflict = true;
                throw new SourceConflictError(
                  "Shopify failed while processing the transformed source, but this bulk has no confirmed update acceptance. The failure was left untouched.",
                );
              }
              try {
                await acknowledgeOwnedFailedUpdate(accessToken, credentials);
                await ctx.runMutation(
                  internal.bulkTransforms.clearFileUpdateAccepted,
                  { itemId: item._id, leaseToken },
                );
                fileUpdateAcceptedAt = undefined;
              } catch (acknowledgeError) {
                throw errorWithCause(
                  `${error.message} The previous file could not be restored: ${errorMessage(acknowledgeError)}`,
                  acknowledgeError,
                );
              }
            }
            throw error;
          }
        }
        await ctx.runMutation(internal.bulkTransforms.markPublished, {
          itemId: item._id,
          leaseToken,
          publishedUrl: media.image?.url ?? item.sourceUrl,
        });
        return null;
      }
      if (sourceState === "conflict") {
        safeToRelease = true;
        conflict = true;
        throw new SourceConflictError(
          "The Shopify image changed after the preview was prepared. It was not overwritten.",
        );
      }
      if (media.fileStatus !== "READY" || media.status !== "READY") {
        throw new Error("The Shopify image is not READY for replacement.");
      }

      safeToRelease = true;
      await renewMediaLease();
      mutationAttempted = true;
      leaseProtectedMutationAttempted = true;
      safeToRelease = false;
      const updated = await shopifyGraphql<{
        fileUpdate: {
          files: Array<{ id: string; fileStatus: string }> | null;
          userErrors: Array<{
            field?: string[] | null;
            message: string;
            code?: string | null;
          }>;
        };
      }>(
        FILE_UPDATE_MUTATION,
        {
          files: [{ id: item.sourceMediaId, originalSource: item.outputUrl }],
        },
        accessToken,
        credentials,
      );
      throwUserErrors(
        updated.fileUpdate.userErrors,
        "Shopify file update failed",
      );
      const acceptedFile = updated.fileUpdate.files?.find(
        (file) => file.id === item.sourceMediaId,
      );
      if (!acceptedFile) {
        throw new Error("Shopify did not confirm the file update request.");
      }
      updateAcceptedByShopify = true;
      const acceptedAt = await ctx.runMutation(
        internal.bulkTransforms.markFileUpdateAccepted,
        { itemId: item._id, leaseToken },
      );
      if (!acceptedAt) {
        throw new Error(
          "The bulk item changed before publication was recorded.",
        );
      }
      fileUpdateAcceptedAt = acceptedAt;
      let verified: MediaImageNode;
      try {
        await renewMediaLease();
        verified = await waitForUpdatedImage({
          mediaId: item.sourceMediaId,
          transformedSha256: item.transformedSha256,
          accessToken,
          credentials,
        });
      } catch (error) {
        if (error instanceof ShopifyFileUpdateFailedError) {
          try {
            await acknowledgeOwnedFailedUpdate(accessToken, credentials);
            await ctx.runMutation(
              internal.bulkTransforms.clearFileUpdateAccepted,
              { itemId: item._id, leaseToken },
            );
            fileUpdateAcceptedAt = undefined;
          } catch (acknowledgeError) {
            throw errorWithCause(
              `${error.message} The previous file could not be restored: ${errorMessage(acknowledgeError)}`,
              acknowledgeError,
            );
          }
        }
        throw error;
      }
      await ctx.runMutation(internal.bulkTransforms.markPublished, {
        itemId: item._id,
        leaseToken,
        publishedUrl: verified.image?.url ?? item.sourceUrl,
      });
    } catch (error) {
      let finalError = error;
      if (
        mutationAttempted &&
        recoveryContext &&
        item.sourceSha256 &&
        item.transformedSha256
      ) {
        const { accessToken, credentials } = recoveryContext;
        try {
          await renewMediaLease();
          let media = await fetchMediaImage({
            mediaId: item.sourceMediaId,
            accessToken,
            credentials,
          });
          if (!media) {
            throw errorWithCause(
              "The Shopify image no longer exists during recovery.",
              error,
            );
          }
          if (media.fileStatus === "FAILED" || media.status === "FAILED") {
            if (
              !bulkTransformOwnsFailedUpdate({
                fileUpdateAcceptedAt,
                updateAcceptedByShopifyInCurrentRun: updateAcceptedByShopify,
              })
            ) {
              throw new SourceConflictError(
                "The failed Shopify update is not owned by this bulk.",
              );
            }
            if (!fileUpdateAcceptedAt) {
              const recoveredAcceptedAt = await ctx.runMutation(
                internal.bulkTransforms.markFileUpdateAccepted,
                { itemId: item._id, leaseToken },
              );
              if (!recoveredAcceptedAt) {
                throw errorWithCause(
                  "The ambiguous Shopify update could not be recorded for recovery.",
                  error,
                );
              }
              fileUpdateAcceptedAt = recoveredAcceptedAt;
            }
            media = await acknowledgeOwnedFailedUpdate(
              accessToken,
              credentials,
            );
            await ctx.runMutation(
              internal.bulkTransforms.clearFileUpdateAccepted,
              { itemId: item._id, leaseToken },
            );
            fileUpdateAcceptedAt = undefined;
          } else if (media.fileStatus !== "READY" || media.status !== "READY") {
            if (updateAcceptedByShopify && !fileUpdateAcceptedAt) {
              const recoveredAcceptedAt = await ctx.runMutation(
                internal.bulkTransforms.markFileUpdateAccepted,
                { itemId: item._id, leaseToken },
              );
              if (!recoveredAcceptedAt) {
                throw errorWithCause(
                  "The ambiguous Shopify update could not be recorded for recovery.",
                  error,
                );
              }
              fileUpdateAcceptedAt = recoveredAcceptedAt;
            }
            await renewMediaLease();
            media = await waitForUpdatedImage({
              mediaId: item.sourceMediaId,
              transformedSha256: item.transformedSha256,
              accessToken,
              credentials,
            });
          }
          const originalUrl = media.originalSource?.url;
          if (originalUrl) {
            const current = await downloadImage(originalUrl);
            const recoveredState = classifyBulkTransformSource({
              currentSha256: imageSha256(current.bytes),
              sourceSha256: item.sourceSha256,
              transformedSha256: item.transformedSha256,
            });
            if (recoveredState === "transformed") {
              await ctx.runMutation(internal.bulkTransforms.markPublished, {
                itemId: item._id,
                leaseToken,
                publishedUrl: media.image?.url ?? item.sourceUrl,
              });
              return null;
            }
            const ambiguitySettled =
              recoverySourceRestored ||
              Boolean(
                item.publishAmbiguousSince &&
                  Date.now() - item.publishAmbiguousSince >=
                    BULK_TRANSFORM_PUBLISH_AMBIGUITY_SETTLE_MS,
              );
            if (recoveredState === "conflict") {
              safeToRelease = ambiguitySettled;
              conflict = ambiguitySettled;
              finalError = ambiguitySettled
                ? new SourceConflictError(
                    "The Shopify image changed while an ambiguous update was being recovered. It was not overwritten again.",
                  )
                : new Error(
                    "Shopify is still settling an earlier ambiguous file update.",
                  );
            } else {
              // A single read of the old source does not prove that an
              // ambiguous Shopify mutation was rejected. Keep the lease until
              // the full settlement window has elapsed without a later state.
              safeToRelease = ambiguitySettled;
            }
          }
        } catch (recoveryError) {
          if (recoveryError instanceof SourceConflictError) {
            safeToRelease = true;
            conflict = true;
            finalError = recoveryError;
          } else if (recoveryError instanceof ShopifyFileUpdateFailedError) {
            if (
              !bulkTransformOwnsFailedUpdate({
                fileUpdateAcceptedAt,
                updateAcceptedByShopifyInCurrentRun: updateAcceptedByShopify,
              })
            ) {
              conflict = true;
              finalError = new SourceConflictError(
                "Shopify reported FAILED during an ambiguous update attempt. This bulk did not acknowledge or restore a failure it could not prove it owned.",
              );
            } else {
              try {
                await acknowledgeOwnedFailedUpdate(accessToken, credentials);
                await ctx.runMutation(
                  internal.bulkTransforms.clearFileUpdateAccepted,
                  { itemId: item._id, leaseToken },
                );
                fileUpdateAcceptedAt = undefined;
                safeToRelease = true;
              } catch (acknowledgeError) {
                finalError = errorWithCause(
                  `${errorMessage(error)} Recovery failed: ${errorMessage(acknowledgeError)}`,
                  acknowledgeError,
                );
              }
            }
          } else {
            finalError = errorWithCause(
              `${errorMessage(error)} Recovery check failed: ${errorMessage(recoveryError)}`,
              recoveryError,
            );
          }
        }
      }
      await ctx.runMutation(internal.bulkTransforms.markPublishFailed, {
        itemId: item._id,
        leaseToken,
        error: errorMessage(finalError),
        conflict: conflict || finalError instanceof SourceConflictError,
        safeToRelease,
        resetAmbiguityWindow: leaseProtectedMutationAttempted,
      });
    }
    return null;
  },
});

export const cleanupExpiredAssets = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const jobs = (await ctx.runQuery(
      internal.bulkTransforms.listJobsForAssetCleanup,
      {},
    )) as Doc<"bulkTransformJobs">[];
    const cutoff = Date.now() - BULK_TRANSFORM_ASSET_RETENTION_MS;
    let scheduled = 0;
    for (const job of jobs) {
      const lease = (await ctx.runMutation(
        internal.bulkTransforms.claimAssetsCleanup,
        { jobId: job._id, cutoff },
      )) as {
        jobId: Doc<"bulkTransformJobs">["_id"];
        leaseStartedAt: number;
      } | null;
      if (!lease) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.bulkTransformsNode.cleanupJobAssets,
        { ...lease, cutoff },
      );
      scheduled += 1;
    }
    return { scheduled };
  },
});

export const cleanupJobAssets = internalAction({
  args: {
    jobId: v.id("bulkTransformJobs"),
    leaseStartedAt: v.number(),
    cutoff: v.number(),
  },
  handler: async (ctx, args): Promise<CleanupJobAssetsResult> => {
    const leaseActive = await ctx.runQuery(
      internal.bulkTransforms.isAssetsCleanupLeaseActive,
      { jobId: args.jobId, leaseStartedAt: args.leaseStartedAt },
    );
    if (!leaseActive) return { cleaned: false, staleLease: true };
    try {
      const result = await deleteR2ObjectsWithPrefix({
        prefix: `bulk-transforms/${args.jobId}/`,
        limit: 5_000,
      });
      if (!result.configured) {
        throw new Error("R2 is not configured; bulk assets were not cleaned.");
      }
      if (result.hasMore) {
        await ctx.scheduler.runAfter(
          5_000,
          internal.bulkTransformsNode.cleanupJobAssets,
          args,
        );
        return { cleaned: false, moreWork: true };
      }
      const marked: Id<"bulkTransformJobs"> | null = await ctx.runMutation(
        internal.bulkTransforms.markAssetsCleaned,
        args,
      );
      return { cleaned: Boolean(marked), moreWork: false };
    } catch (error) {
      console.warn(
        `Bulk transform asset cleanup failed for ${args.jobId}: ${errorMessage(error)}`,
      );
      await ctx.scheduler.runAfter(
        5 * 60 * 1000,
        internal.bulkTransformsNode.cleanupJobAssets,
        args,
      );
      return { cleaned: false, retrying: true };
    }
  },
});
