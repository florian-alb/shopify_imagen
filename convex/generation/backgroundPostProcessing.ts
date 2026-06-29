"use node";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  BACKGROUND_REMOVAL_COST_USD,
  BACKGROUND_REMOVAL_PROVIDER,
  backgroundConfigFrom,
} from "../background";
import { removeBackgroundWithFal } from "./backgroundRemoval";
import { downloadBinary } from "./download";
import {
  composeBackgroundFinal,
  normalizeTransparentCutout,
  prepareFalInputImage,
} from "./images";
import { uniqueStorageToken, uploadToR2 } from "./storage";
import type { GeneratedImage } from "./types";

export async function applyBackgroundPostProcessing(args: {
  ctx: ActionCtx;
  image: Doc<"generatedImages">;
  generated: GeneratedImage;
  safeHandle: string;
  providerCostUsd?: number;
  costRateMultiplier?: number;
  providerBatchId?: string | null;
}): Promise<GeneratedImage> {
  const config = backgroundConfigFrom(args.image);
  if (!config.removeBackground) return args.generated;

  const token = uniqueStorageToken();
  let inputUrl = args.image.backgroundRemovalInputUrl ?? null;
  if (!inputUrl) {
    const prepared = await prepareFalInputImage(args.generated);
    const inputKey = `generated/${args.safeHandle}/${token}/fal-input.${prepared.extension}`;
    inputUrl = await uploadToR2({
      bytes: prepared.bytes,
      key: inputKey,
      contentType: prepared.contentType,
    });
    await args.ctx.runMutation(internal.jobs.markBackgroundRemovalStaged, {
      imageId: args.image._id,
      inputUrl,
      inputContentType: prepared.contentType,
      inputExtension: prepared.extension,
      providerBatchId: args.providerBatchId ?? args.generated.providerBatchId,
      providerRequestId: args.generated.providerRequestId,
      providerResponseId: args.generated.providerResponseId,
      inputTokens: args.generated.usage.inputTokens,
      outputTokens: args.generated.usage.outputTokens,
      costUsd: args.providerCostUsd,
      costRateMultiplier: args.costRateMultiplier,
    });
  }

  const removed = await removeBackgroundWithFal(inputUrl, downloadBinary);
  const cutoutPng = await normalizeTransparentCutout(removed.bytes);
  const cutoutKey = `generated/${args.safeHandle}/${token}/transparent-cutout.png`;
  const transparentCutoutUrl = await uploadToR2({
    bytes: cutoutPng,
    key: cutoutKey,
    contentType: "image/png",
  });
  const final = await composeBackgroundFinal({
    cutoutBytes: cutoutPng,
    backgroundMode: config.backgroundMode,
    backgroundColor: config.backgroundColor,
    backgroundShadow: config.backgroundShadow,
  });

  return {
    ...args.generated,
    ...final,
    transparentCutoutUrl,
    backgroundRemovalProvider: BACKGROUND_REMOVAL_PROVIDER,
    backgroundRemovalCostUsd: BACKGROUND_REMOVAL_COST_USD,
    backgroundRemovalRequestId: removed.requestId,
  };
}
