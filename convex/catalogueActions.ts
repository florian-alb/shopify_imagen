"use node";
import { randomUUID, createHash } from "node:crypto";
import { load } from "cheerio";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  decode,
  encode,
  collectionMenu,
  identity,
  effective,
  type Structure,
  type Work,
  type CatalogProduct,
} from "./catalogue/model";
import { collectionKey, productLink } from "./catalogue/source";
import {
  extractMenu,
  extractCollection,
  extractProduct,
} from "./catalogue/extract";
import {
  fetchPublic,
  withSourceBudget,
  CollectionHttpError,
} from "./catalogue/network";
import { proposeTags } from "./catalogue/ai";
import { exportStorage, signedExport } from "./catalogue/storage";
import { importStep } from "./catalogue/shopify";

type Fence = { id: Id<"catalogues">; generation: number; token: string };
type Page = {
  page: Doc<"produits">[];
  isDone: boolean;
  continueCursor: string;
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Erreur inattendue.";
function sourceUrl(input: string, origin: string) {
  const url = new URL(input, origin);
  if (
    url.hostname.replace(/^www\./, "") !==
      new URL(origin).hostname.replace(/^www\./, "") ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("URL hors de la boutique source.");
  return `${origin}${url.pathname}${url.search}`;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const download = action({
  args: { id: v.id("catalogues") },
  returns: v.string(),
  handler: async (ctx, a): Promise<string> => {
    const c = decode<Doc<"catalogues">>(
      await ctx.runQuery(api.catalogues.get, a),
    );
    if (!c.exportKey || c.exportVersion !== c.version || c.work)
      throw new Error("Régénérez le JSON du catalogue courant.");
    return signedExport(c.exportKey);
  },
});
export const suggestTags = action({
  args: { id: v.id("catalogues") },
  returns: v.array(v.object({ key: v.string(), tag: v.string() })),
  handler: async (ctx, a): Promise<Array<{ key: string; tag: string }>> => {
    const c = decode<{ structure: Structure }>(
      await ctx.runQuery(api.catalogues.get, a),
    );
    return proposeTags(
      c.structure.collections.filter((x) => !x.edited && !x.validated),
    );
  },
});
async function context(
  ctx: ActionCtx,
  id: Id<"catalogues">,
): Promise<Doc<"catalogues">> {
  const c = await ctx.runQuery(internal.catalogues.context, { id });
  if (!c) throw new Error("Catalogue supprimé.");
  return c;
}
async function checkpoint(
  ctx: ActionCtx,
  f: Fence,
  work: Work | undefined,
  structure?: Structure,
  status?: "tags" | "ready" | "partial",
  extra: {
    exportKey?: string;
    lastImport?: string;
    delay?: number;
    error?: string;
  } = {},
) {
  if (work) {
    work.attempts = 0;
    work.retryAt = undefined;
  }
  await ctx.runMutation(internal.catalogues.checkpoint, {
    ...f,
    ...(work ? { work: encode(work) } : {}),
    ...(structure ? { structure: encode(structure) } : {}),
    ...(status ? { status } : {}),
    ...extra,
  });
}
async function discovery(
  ctx: ActionCtx,
  f: Fence,
  c: Doc<"catalogues">,
  w: Work,
) {
  let s = decode<Structure>(c.structure);
  if (w.phase === "menu") {
    const html = await fetchPublic(c.origin);
    try {
      s.menu = collectionMenu(extractMenu(html, c.origin).menu, c.origin);
    } catch (e) {
      s.warnings.push(message(e));
    }
    w.phase = "sitemap";
    w.maps = [`${c.origin}/sitemap.xml`];
    w.visited = [];
    return checkpoint(ctx, f, w, s);
  }
  if (w.phase === "sitemap") {
    const url = w.maps?.[0] ? sourceUrl(w.maps[0], c.origin) : undefined;
    if (!url) {
      const visit = (nodes: Structure["menu"]) =>
        nodes.forEach((node) => {
          const key = node.url ? collectionKey(node.url, c.origin) : null;
          if (key && !s.collections.some((x) => x.key === key)) {
            s.collections.push({
              key,
              url: node.url!,
              title: node.title,
              description: "",
              image: null,
              tag: "",
              validated: false,
              outsideMenu: false,
              membership: "pending",
              count: 0,
              selectedCount: 0,
            });
            s.warnings.push(
              `Collection du menu absente du sitemap : ${node.title}.`,
            );
          }
          visit(node.children);
        });
      visit(s.menu);
      w.phase = "ranking";
      w.url = `${c.origin}/collections/all?sort_by=best-selling`;
      w.rank = 0;
      w.visited = [];
      return checkpoint(ctx, f, w, s);
    }
    if (new URL(url).origin !== c.origin)
      throw new Error("Sitemap hors de la boutique source.");
    const xml = load(await fetchPublic(url), { xml: true });
    if (!xml("sitemapindex, urlset").length)
      throw new Error("Sitemap XML invalide.");
    const maps = xml("sitemap > loc")
      .toArray()
      .map((el) => sourceUrl(xml(el).text(), c.origin))
      .filter((u) => /sitemap_(products|collections)/.test(u));
    const locations = xml("url > loc")
      .toArray()
      .map((el) => xml(el).text());
    const offset = w.offset ?? 0,
      slice = locations.slice(offset, offset + 100);
    const links = slice.flatMap((url) => {
      const p = productLink(url, c.origin);
      return p
        ? [
            {
              handle: p.handle,
              url: p.url,
              selected: c.mode === "ALL",
              sitemap: true,
            },
          ]
        : [];
    });
    if (links.length)
      await ctx.runMutation(internal.catalogues.links, { ...f, links });
    s = decode<Structure>((await context(ctx, c._id)).structure);
    const menuKeys = new Set<string>();
    const visit = (nodes: Structure["menu"]) =>
      nodes.forEach((n) => {
        if (n.url) {
          const k = collectionKey(n.url, c.origin);
          if (k) menuKeys.add(k);
        }
        visit(n.children);
      });
    visit(s.menu);
    for (const url of slice) {
      const key = collectionKey(url, c.origin);
      if (key && !s.collections.some((x) => x.key === key))
        s.collections.push({
          key,
          url,
          title: key.replace(/-/g, " "),
          description: "",
          image: null,
          tag: "",
          validated: false,
          outsideMenu: !menuKeys.has(key),
          membership: "pending",
          count: 0,
          selectedCount: 0,
        });
    }
    if (offset + slice.length < locations.length)
      w.offset = offset + slice.length;
    else {
      w.visited = [...(w.visited ?? []), url];
      w.maps = [
        ...w.maps!.slice(1),
        ...maps.filter((u) => !w.visited!.includes(u) && !w.maps!.includes(u)),
      ];
      w.offset = 0;
    }
    return checkpoint(ctx, f, w, s);
  }
  if (w.phase === "ranking") {
    const url = w.url!,
      result = extractCollection(await fetchPublic(url), url, c.origin);
    const fingerprint = hash(encode(result.products.map((p) => p.handle)));
    if (fingerprint === w.pageFingerprint)
      throw new Error(
        "Page meilleures ventes répétée : classement interrompu.",
      );
    const rank: number = await ctx.runMutation(internal.catalogues.rankPage, {
      ...f,
      products: result.products.map((p) => ({ handle: p.handle, url: p.url })),
      rank: w.rank ?? 0,
      initial: !w.addition,
    });
    const fresh = await context(ctx, c._id);
    s = decode<Structure>(fresh.structure);
    w.rank = rank;
    w.pageFingerprint = fingerprint;
    const enough = c.mode === "TOP_N" && !w.addition && fresh.total >= c.topN!;
    if (result.nextUrl && !enough) {
      const next = new URL(sourceUrl(result.nextUrl, c.origin));
      if (
        next.origin !== c.origin ||
        next.searchParams.get("sort_by") !== "best-selling" ||
        (w.visited ?? []).includes(next.href)
      )
        throw new Error("Pagination meilleures ventes invalide.");
      w.visited = [...(w.visited ?? []), url];
      w.url = next.href;
    } else {
      if (
        (c.mode === "ALL" || w.addition) &&
        rank < fresh.sourceCount &&
        !s.warnings.includes(
          "Le classement ne couvre pas tous les produits : les rangs inconnus restent signalés.",
        )
      )
        s.warnings.push(
          "Le classement ne couvre pas tous les produits : les rangs inconnus restent signalés.",
        );
      s.ranking = {
        rank,
        ...(result.nextUrl
          ? { nextUrl: sourceUrl(result.nextUrl, c.origin) }
          : {}),
      };
      w.phase = w.addition || w.replenish ? "collect" : "members";
      w.collection = 0;
      w.url = undefined;
      w.cursor = undefined;
      w.pageFingerprint = undefined;
      w.visited = [];
      if (!enough && c.mode === "TOP_N" && fresh.total < c.topN!) {
        s = decode<Structure>(fresh.structure);
        s.warnings.push(
          `Seulement ${fresh.total} produits disponibles pour le Top ${c.topN}.`,
        );
      }
    }
    return checkpoint(ctx, f, w, s);
  }
  if (w.phase === "members") {
    const col = s.collections[w.collection ?? 0];
    if (!col) {
      w.phase = "suggest";
      return checkpoint(ctx, f, w);
    }
    const url = w.url ?? `${col.url}?sort_by=best-selling`,
      html = await fetchPublic(url),
      result = extractCollection(html, url, c.origin);
    const fingerprint = hash(encode(result.products.map((p) => p.handle)));
    if (fingerprint === w.pageFingerprint || (w.visited ?? []).includes(url))
      throw new Error(`Pagination répétée : ${col.title}`);
    await ctx.runMutation(internal.catalogues.links, {
      ...f,
      links: result.products.map((p) => ({
        handle: p.handle,
        url: p.url,
        collection: col.key,
        selected: !!w.addition || c.mode === "ALL",
      })),
    });
    s = decode<Structure>((await context(ctx, c._id)).structure);
    const updated = s.collections[w.collection ?? 0];
    updated.title =
      load(html)("main h1, h1").first().text().trim() || updated.title;
    updated.description = result.details.description;
    updated.image = result.details.image;
    if (result.nextUrl) {
      w.url = sourceUrl(result.nextUrl, c.origin);
      w.visited = [...(w.visited ?? []), url];
      w.pageFingerprint = fingerprint;
    } else {
      updated.membership = "complete";
      updated.error = undefined;
      w.collection = (w.collection ?? 0) + 1;
      w.url = undefined;
      w.pageFingerprint = undefined;
      w.visited = [];
      if (w.addition) {
        w.phase = "ranking";
        w.url = `${c.origin}/collections/all?sort_by=best-selling`;
        w.rank = 0;
      }
    }
    return checkpoint(ctx, f, w, s);
  }
  if (w.phase === "suggest") {
    let error: string | undefined;
    try {
      for (const p of await proposeTags(
        s.collections.filter((x) => !x.edited && !x.validated),
      )) {
        const col = s.collections.find((x) => x.key === p.key);
        if (col && !col.edited && !col.validated) col.tag = p.tag;
      }
    } catch (e) {
      error = `Propositions IA indisponibles : ${message(e)}. Saisissez les tags ou réessayez.`;
    }
    return checkpoint(ctx, f, undefined, s, "tags", { error });
  }
}
async function collect(
  ctx: ActionCtx,
  f: Fence,
  c: Doc<"catalogues">,
  w: Work,
) {
  const s = decode<Structure>(c.structure);
  if (w.phase === "retry") {
    const page: Page = await ctx.runQuery(internal.catalogues.page, {
      id: c._id,
      cursor: w.cursor,
      selected: true,
    });
    for (const p of page.page)
      if (p.state === "failed")
        await ctx.runMutation(internal.catalogues.result, {
          ...f,
          productId: p._id,
          state: "pending",
          attempts: 0,
        });
    w.cursor = page.isDone ? undefined : page.continueCursor;
    if (page.isDone) {
      w.phase = "collect";
      w.collection = 0;
    }
    return checkpoint(ctx, f, w);
  }
  const groups = [...s.collections.map((x) => x.key), "~none"],
    group = groups[w.collection ?? 0];
  if (!group) {
    if (c.mode === "TOP_N" && c.total < c.topN!) {
      if (await ctx.runMutation(internal.catalogues.fillTop, f)) {
        w.collection = 0;
        w.cursor = undefined;
        return checkpoint(ctx, f, w);
      }
      if (s.ranking?.nextUrl) {
        w.phase = "ranking";
        w.replenish = true;
        w.url = s.ranking.nextUrl;
        w.rank = s.ranking.rank;
        w.visited = [];
        w.pageFingerprint = undefined;
        return checkpoint(ctx, f, w);
      }
      const warning = `${c.total} identités produit distinctes disponibles pour le Top ${c.topN}.`;
      if (!s.warnings.includes(warning)) s.warnings.push(warning);
      return checkpoint(ctx, f, undefined, s);
    }
    return checkpoint(ctx, f, undefined);
  }
  const page: Page = await ctx.runQuery(internal.catalogues.page, {
    id: c._id,
    selected: true,
    group,
    cursor: w.cursor,
  });
  const started = Date.now();
  let interrupted = false;
  for (const p of page.page) {
    if (p.state !== "pending") continue;
    if (Date.now() - started > 45_000) {
      interrupted = true;
      break;
    }
    const old = p.data ? decode<CatalogProduct>(p.data) : null;
    let jsonSource = old?.jsonStatus === "complete" ? p.jsonSource : undefined,
      raw: unknown = jsonSource ? JSON.parse(jsonSource) : null,
      html: string | null = null;
    const errors: string[] = [];
    const responses = await Promise.allSettled([
      jsonSource ? Promise.resolve(jsonSource) : fetchPublic(`${p.url}.json`),
      fetchPublic(p.url),
    ]);
    if (responses[0].status === "fulfilled") {
      jsonSource = responses[0].value;
      try {
        raw = JSON.parse(jsonSource);
      } catch {
        errors.push("JSON source invalide.");
        jsonSource = undefined;
      }
    } else errors.push(`JSON : ${message(responses[0].reason)}`);
    if (responses[1].status === "fulfilled") html = responses[1].value;
    else errors.push(`HTML : ${message(responses[1].reason)}`);
    let data: CatalogProduct;
    try {
      data = extractProduct(
        { handle: p.handle, url: p.url, collections: p.collections },
        raw,
        html,
        errors,
      );
    } catch (e) {
      data = extractProduct(
        { handle: p.handle, url: p.url, collections: p.collections },
        null,
        html,
        [...errors, message(e)],
      );
    }
    const complete =
      data.jsonStatus === "complete" &&
      data.htmlStatus === "complete" &&
      data.errors.length === 0;
    const attempts = p.attempts + 1,
      state = complete ? "complete" : attempts >= 3 ? "failed" : "pending";
    if (state === "pending") w.passPending = true;
    await ctx.runMutation(internal.catalogues.result, {
      ...f,
      productId: p._id,
      data: encode(data),
      ...(jsonSource ? { jsonSource } : {}),
      ...(data.sourceId ? { identity: identity(c.origin, data.sourceId) } : {}),
      state,
      attempts,
      ...(!complete ? { error: data.errors.join(" · ") } : {}),
    });
    const blocked = responses.find(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof CollectionHttpError &&
        [403, 429, 503].includes(r.reason.status),
    );
    if (blocked?.status === "rejected") throw blocked.reason;
  }
  if (!interrupted) {
    if (page.isDone) {
      w.cursor = undefined;
      if (w.passPending) w.passPending = false;
      else w.collection = (w.collection ?? 0) + 1;
    } else w.cursor = page.continueCursor;
  }
  return checkpoint(ctx, f, w);
}
async function exportCatalogue(
  ctx: ActionCtx,
  f: Fence,
  c: Doc<"catalogues">,
  w: Work,
) {
  const key = `catalogues/${c._id}/catalogue.json`,
    s = decode<Structure>(c.structure);
  // Generation persists across automatic and user retries of this export.
  w.generation ??= f.generation;
  const token = `${c._id}-${w.generation}-${c.version}`;
  await exportStorage(async (io) => {
    if (await io.exists(key, token))
      return checkpoint(ctx, f, undefined, undefined, undefined, {
        exportKey: key,
      });
    if (!w.upload) {
      w.upload = { id: await io.begin(key, token), parts: [], count: 0 };
      await ctx.runMutation(internal.catalogues.hold, {
        ...f,
        work: encode(w),
      });
    }
    const chunks: Buffer[] = [];
    let bytes = 0,
      count = w.upload.count,
      cursor = w.cursor,
      done: boolean;
    const push = (text: string) => {
      const b = Buffer.from(text);
      chunks.push(b);
      bytes += b.length;
    };
    if (!w.upload.parts.length)
      push(
        encode({
          formatVersion: 2,
          origin: c.origin,
          mode: c.mode,
          topN: c.topN,
          version: c.version,
          structure: s,
          total: c.total,
          complete: c.complete,
          failed: c.failed,
          sourceCount: c.sourceCount,
        }).slice(0, -1) + ',"products":[',
      );
    const started = Date.now();
    do {
      if (Date.now() - started > 45_000)
        throw new Error(
          "Lecture d’export trop lente ; la partie courante sera reprise.",
        );
      const page: Page = await ctx.runQuery(internal.catalogues.page, {
        id: c._id,
        cursor,
        selected: true,
      });
      for (const p of page.page) {
        push(
          (count ? "," : "") +
            encode({
              identity: p.identity,
              url: p.url,
              collections: p.collections,
              rank: p.rank === Number.MAX_SAFE_INTEGER ? null : p.rank,
              state: p.state,
              error: p.error,
              jsonSource: p.jsonSource ? JSON.parse(p.jsonSource) : null,
              jsonSourceText: p.jsonSource ?? null,
              data: p.data
                ? effective(
                    {
                      ...decode<CatalogProduct>(p.data),
                      collections: p.collections,
                    },
                    s,
                    decode(p.override ?? "{}"),
                  )
                : null,
              override: decode(p.override ?? "{}"),
            }),
        );
        count++;
      }
      cursor = page.isDone ? undefined : page.continueCursor;
      done = page.isDone;
    } while (!done && bytes < 5 * 1024 * 1024);
    if (done) push("]}");
    const part = {
      ETag: await io.part(
        key,
        w.upload.id,
        w.upload.parts.length + 1,
        Buffer.concat(chunks),
      ),
      PartNumber: w.upload.parts.length + 1,
    };
    // Replaying an interrupted part overwrites the same part number, never appends twice.
    if (done) {
      await io.finish(key, w.upload.id, [...w.upload.parts, part]);
      return checkpoint(ctx, f, undefined, undefined, undefined, {
        exportKey: key,
      });
    }
    w.upload.parts.push(part);
    w.upload.count = count;
    w.cursor = cursor;
    return checkpoint(ctx, f, w);
  });
}
export const work = internalAction({
  args: { id: v.id("catalogues"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, a) => {
    const f = { ...a, token: randomUUID() },
      c: Doc<"catalogues"> | null = await ctx.runMutation(
        internal.catalogues.claim,
        f,
      );
    if (!c?.work) return null;
    const w = decode<Work>(c.work);
    try {
      await withSourceBudget(
        async () => {
          if (w.kind === "export") await exportCatalogue(ctx, f, c, w);
          else if (w.kind === "import") await importStep(ctx, f, c, w);
          else if (["collect", "retry"].includes(w.phase))
            await collect(ctx, f, c, w);
          else await discovery(ctx, f, c, w);
        },
        4,
        w.sourceDelay ?? 450,
      );
    } catch (e) {
      const attempts = (w.attempts ?? 0) + 1;
      w.attempts = attempts;
      const transient =
        !(e instanceof CollectionHttpError && e.status === 403) && attempts < 3;
      const delay = Math.max(
        3000 * 2 ** attempts,
        e instanceof CollectionHttpError ? e.retryAfterMs : 0,
      );
      w.retryAt = Date.now() + delay;
      if (e instanceof CollectionHttpError && [429, 503].includes(e.status))
        w.sourceDelay = Math.min(3000, (w.sourceDelay ?? 450) * 2);
      const latest = await context(ctx, c._id);
      const structure = decode<Structure>(latest.structure);
      if (
        !transient &&
        w.phase === "members" &&
        structure.collections[w.collection ?? 0]
      ) {
        structure.collections[w.collection ?? 0].membership = "failed";
        structure.collections[w.collection ?? 0].error = message(e);
      }
      await ctx.runMutation(internal.catalogues.checkpoint, {
        ...f,
        work: encode(w),
        status: transient ? "working" : "blocked",
        error: message(e),
        structure: encode(structure),
        delay,
      });
    }
    return null;
  },
});
