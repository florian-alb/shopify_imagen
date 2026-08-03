import type { ShopifyCredentials } from "../shopScope";
import { getAccessToken, shopifyGraphql } from "./client";
import {
  PRODUCT_REORDER_MEDIA_MUTATION,
  SHOPIFY_JOB_QUERY,
} from "./graphql";
import { buildMediaMoves, throwUserErrors } from "./media";

export type ShopifyMediaOrderNode = {
  id: string;
  mediaContentType: string;
};

export async function waitForShopifyJob(args: {
  jobId: string;
  credentials: ShopifyCredentials;
  accessToken?: string;
  attempts?: number;
}) {
  const accessToken =
    args.accessToken ?? (await getAccessToken(args.credentials));
  for (let attempt = 0; attempt < (args.attempts ?? 20); attempt += 1) {
    const data = await shopifyGraphql<{ job: { done: boolean } | null }>(
      SHOPIFY_JOB_QUERY,
      { id: args.jobId },
      accessToken,
      args.credentials,
    );
    if (data.job?.done) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export async function submitShopifyMediaReorder(args: {
  productId: string;
  mediaNodes: ShopifyMediaOrderNode[];
  orderedImageIds: string[];
  credentials: ShopifyCredentials;
  accessToken?: string;
  waitAttempts?: number;
}) {
  const moves = buildMediaMoves(args.mediaNodes, args.orderedImageIds);
  if (!moves.length) {
    return { reordered: 0, jobId: null, completed: true };
  }
  const accessToken =
    args.accessToken ?? (await getAccessToken(args.credentials));
  const data = await shopifyGraphql<{
    productReorderMedia: {
      job: { id: string } | null;
      mediaUserErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    PRODUCT_REORDER_MEDIA_MUTATION,
    { id: args.productId, moves },
    accessToken,
    args.credentials,
  );
  throwUserErrors(
    data.productReorderMedia.mediaUserErrors,
    "Shopify product media reorder failed",
  );
  const jobId = data.productReorderMedia.job?.id ?? null;
  const completed = jobId
    ? await waitForShopifyJob({
      jobId,
      accessToken,
      credentials: args.credentials,
      attempts: args.waitAttempts,
    })
    : true;
  return { reordered: moves.length, jobId, completed };
}
