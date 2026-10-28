import { ConvexError } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import type { ShopifyCredentials } from "../shopScope";
import { shopifyGraphql } from "./client";
import { PRODUCT_VARIANTS_GOOGLE_FEED_QUERY } from "./graphql";
import { googleFeedQueryVariables, type GoogleFeedSyncCoordinates } from "./productQuery";

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
export type SyncedShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  variants?: { nodes: Array<Record<string, unknown>>; pageInfo?: PageInfo };
  [key: string]: unknown;
};

export function validateProductPage(value: unknown, after: string | null) {
  const data = value as { products?: { nodes?: unknown; pageInfo?: Partial<PageInfo> } };
  const connection = data?.products;
  if (!connection || !Array.isArray(connection.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean")
    throw new ConvexError("Shopify a retourné une page de produits incomplète.");
  const { hasNextPage, endCursor } = connection.pageInfo;
  if (hasNextPage && (typeof endCursor !== "string" || !endCursor || endCursor === after || !connection.nodes.length))
    throw new ConvexError("Shopify n’a pas fourni de curseur valide pour poursuivre la synchronisation.");
  for (const node of connection.nodes) {
    if (!node || typeof node !== "object" || typeof node.id !== "string" || !node.id ||
      typeof node.title !== "string" || typeof node.handle !== "string")
      throw new ConvexError("Shopify a retourné un produit incomplet.");
  }
  return { nodes: connection.nodes as SyncedShopifyProduct[], hasNextPage, endCursor: endCursor ?? null };
}

export async function loadRemainingGoogleFeedVariants(
  product: SyncedShopifyProduct,
  coordinates: GoogleFeedSyncCoordinates,
  credentials: ShopifyCredentials,
) {
  if (!product.variants || !Array.isArray(product.variants.nodes) || typeof product.variants.pageInfo?.hasNextPage !== "boolean")
    throw new ConvexError("Les variantes Shopify n’ont pas pu être lues complètement.");
  const nodes = [...product.variants.nodes];
  let pageInfo = product.variants.pageInfo;
  const seen = new Set<string>();
  while (pageInfo?.hasNextPage) {
    const after = pageInfo.endCursor;
    if (!after || seen.has(after)) throw new ConvexError("La pagination des variantes Shopify est incomplète.");
    seen.add(after);
    const response = await shopifyGraphql<{
      product: { variants: { nodes: Array<Record<string, unknown>>; pageInfo: PageInfo } } | null;
    }>(PRODUCT_VARIANTS_GOOGLE_FEED_QUERY, {
      productId: product.id, after, ...googleFeedQueryVariables(coordinates),
    }, undefined, credentials);
    const connection = response.product?.variants;
    if (!connection || !Array.isArray(connection.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean")
      throw new ConvexError("Les variantes Shopify n’ont pas pu être lues complètement.");
    nodes.push(...connection.nodes);
    pageInfo = connection.pageInfo;
  }
  product.variants = { nodes, pageInfo };
  return product;
}

export const PRODUCT_PRESENCE_QUERY = `query ProductPresence($ids: [ID!]!) {
  nodes(ids: $ids) { __typename ... on Product { id } }
}`;

export function missingProductIds(value: unknown, ids: string[]) {
  const nodes = (value as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes) || nodes.length !== ids.length)
    throw new ConvexError("Shopify n’a pas confirmé l’existence de tous les produits demandés.");
  const missing = new Set<string>();
  nodes.forEach((node, index) => {
    if (node === null) missing.add(ids[index]);
    else if (!node || typeof node !== "object" || node.__typename !== "Product" || node.id !== ids[index])
      throw new ConvexError("Shopify a retourné une réponse de présence incohérente.");
  });
  return missing;
}

// The context parameter documents that this helper is server-only; it never
// mutates Shopify and all archive decisions are rechecked by a mutation.
export async function readMissingProducts(
  _ctx: Pick<ActionCtx, "runQuery">,
  credentials: ShopifyCredentials,
  ids: string[],
) {
  if (!ids.length) return new Set<string>();
  return missingProductIds(await shopifyGraphql<unknown>(PRODUCT_PRESENCE_QUERY, { ids }, undefined, credentials), ids);
}
