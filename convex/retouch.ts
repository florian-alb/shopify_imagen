"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { mimeToExtension } from "./generation/formats";
import {
  deleteFromR2,
  uniqueStorageToken,
  uploadToR2,
} from "./generation/storage";

const MAX_RETOUCH_BYTES = 15 * 1024 * 1024;
const PREPARED_SOURCE_RETENTION_MS = 60 * 60 * 1000;

export const deletePreparedRetouchSource = internalAction({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.storage.delete(args.storageId);
    } catch (error) {
      console.warn(
        `Prepared retouch source cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
});

export const prepareRetouchSource = action({
  args: {
    sourceImageId: v.id("generatedImages"),
  },
  handler: async (ctx, args): Promise<string> => {
    await requireUserId(ctx);
    const source = (await ctx.runQuery(internal.jobs.retouchSourceForSave, {
      imageId: args.sourceImageId,
    })) as Doc<"generatedImages"> | null;
    if (!source?.storageUrl) throw new Error("Source image not found.");

    const response = await fetch(source.storageUrl);
    if (!response.ok) {
      throw new Error(`Source image download failed (${response.status}).`);
    }

    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/png";
    if (!contentType.startsWith("image/")) {
      throw new Error("Source image is not an image file.");
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) throw new Error("Source image is empty.");
    if (bytes.byteLength > MAX_RETOUCH_BYTES) {
      throw new Error("Source image must be 15 MB or smaller.");
    }

    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: contentType }),
    );
    await ctx.scheduler.runAfter(
      PREPARED_SOURCE_RETENTION_MS,
      internal.retouch.deletePreparedRetouchSource,
      { storageId },
    );
    const preparedUrl = await ctx.storage.getUrl(storageId);
    if (!preparedUrl) throw new Error("Prepared retouch source was not found.");
    return preparedUrl;
  },
});

export const saveRetouchedImage = action({
  args: {
    sourceImageId: v.id("generatedImages"),
    storageId: v.id("_storage"),
    contentType: v.optional(v.string()),
    saveMode: v.optional(v.union(v.literal("version"), v.literal("overwrite"))),
  },
  handler: async (ctx, args): Promise<Id<"generatedImages">> => {
    await requireUserId(ctx);
    const saveMode = args.saveMode ?? "version";
    const source = (await ctx.runQuery(internal.jobs.retouchSourceForSave, {
      imageId: args.sourceImageId,
    })) as Doc<"generatedImages"> | null;
    if (!source) throw new Error("Source image not found.");

    const temporaryUrl = await ctx.storage.getUrl(args.storageId);
    if (!temporaryUrl) throw new Error("Retouched upload was not found.");

    const response = await fetch(temporaryUrl);
    if (!response.ok) {
      throw new Error(`Retouched upload download failed (${response.status}).`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Retouched image is empty.");
    if (bytes.length > MAX_RETOUCH_BYTES) {
      throw new Error("Retouched image must be 15 MB or smaller.");
    }

    const contentType =
      args.contentType?.trim() ||
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/png";
    if (!contentType.startsWith("image/")) {
      throw new Error("Retouched upload must be an image file.");
    }

    const extension = mimeToExtension(contentType);
    const storageUrl = await uploadToR2({
      bytes,
      contentType,
      key: `retouched/${source.productId}/${source._id}-${uniqueStorageToken()}.${extension}`,
    });

    try {
      await ctx.storage.delete(args.storageId);
    } catch (error) {
      console.warn(
        `Retouch temporary file cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const imageId = await ctx.runMutation(internal.jobs.insertRetouchedImage, {
      sourceImageId: source._id,
      storageUrl,
      saveMode,
    });

    if (saveMode === "overwrite") {
      const staleUrls = Array.from(
        new Set(
          [
            source.storageUrl,
            source.generatedImageUrl,
            source.backgroundRemovalInputUrl,
            source.transparentCutoutUrl,
          ].filter((url): url is string => Boolean(url) && url !== storageUrl),
        ),
      );

      for (const staleUrl of staleUrls) {
        try {
          await deleteFromR2(staleUrl);
        } catch (error) {
          console.warn(
            `Retouch overwritten file cleanup failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return imageId;
  },
});
