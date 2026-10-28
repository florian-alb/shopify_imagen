import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { mergeFacets, type ProductFacets } from "./catalog";

export async function refreshFacets(
  ctx: ActionCtx,
  shopId: Id<"shops"> | null,
): Promise<Id<"appSettings">> {
  let cursor: string | null = null;
  let facets: ProductFacets = { productTypes: [], shopifyStatuses: [], collections: [] };
  while (true) {
    // Each page gets a separate transaction; product media/variants/metafields
    // can exceed 16 MiB even in a single shop. Return only the page's facets.
    const result: { facets: ProductFacets; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(internal.products.facetPage, {
        shopId,
        paginationOpts: {
          cursor,
          numItems: 100,
          maximumBytesRead: 2 * 1024 * 1024,
        },
      });
    facets = mergeFacets(facets, result.facets);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  // Keep the previous complete cache visible until every page has been read.
  return await ctx.runMutation(internal.products.storeFacets, { shopId, facets });
}
