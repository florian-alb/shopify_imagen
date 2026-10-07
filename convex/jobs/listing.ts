import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ShopScope } from "../shopScope";

// Merge the active shop and its optional legacy rows in index order. Keeping
// one head per stream avoids loading another shop's history or all past jobs.
export async function* scopedJobsNewestFirst(ctx: QueryCtx, scope: ShopScope) {
  const shopIds = [
    ...(scope.shopId ? [scope.shopId] : []),
    ...(scope.includeLegacy ? [undefined] : []),
  ];
  const streams = shopIds.map(shopId => ctx.db
    .query("generationJobs")
    .withIndex("by_shop_and_created", q => q.eq("shopId", shopId))
    .order("desc")[Symbol.asyncIterator]());
  const heads = await Promise.all(streams.map(stream => stream.next()));
  try {
    while (true) {
      let next = -1;
      for (let i = 0; i < heads.length; i++) {
        if (heads[i].done) continue;
        if (next === -1 || newer(heads[i].value, heads[next].value)) next = i;
      }
      if (next === -1) return;
      yield heads[next].value as Doc<"generationJobs">;
      heads[next] = await streams[next].next();
    }
  } finally {
    await Promise.all(streams.map(stream => stream.return?.()));
  }
}

function newer(a: Doc<"generationJobs">, b: Doc<"generationJobs">) {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt &&
    (a._creationTime > b._creationTime || (a._creationTime === b._creationTime && a._id > b._id)));
}
