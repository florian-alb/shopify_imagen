/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { PaginationResult } from "convex/server";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import {
  decode,
  encode,
  guardSize,
  effective,
  effectiveMenu,
  collectionMenu,
  type Structure,
  type Work,
} from "./model";
import { extractProduct, cleanHtml } from "./extract";
import { readFileSync } from "node:fs";
import { targetMenu } from "./shopify";
import { validCollectionTag, type TagLanguage } from "./tags";

const source = vi.hoisted(() => ({
  pages: new Map<string, string>(),
  failures: new Set<string>(),
  calls: [] as string[],
  exportParts: new Map<number, string>(),
  exportText: "",
  exportToken: "",
  uploadToken: "",
  finishLost: false,
  tagLanguages: [] as string[],
}));
vi.mock("./network", () => ({
  withSourceBudget: (run: () => Promise<unknown>) => run(),
  fetchPublic: async (url: string) => {
    source.calls.push(url);
    if (source.failures.has(url)) throw new Error("HTML timeout");
    if (!source.pages.has(url)) throw new Error(`Unexpected URL ${url}`);
    return source.pages.get(url)!;
  },
  CollectionHttpError: class extends Error {
    status = 500;
    retryAfterMs = 0;
  },
}));
vi.mock("./ai", () => ({
  proposeTags: async (cols: Array<{ key: string }>, language: string) => {
    source.tagLanguages.push(language);
    return cols.map((c) => ({ key: c.key, tag: c.key }));
  },
}));
vi.mock("./storage", () => ({
  signedExport: vi.fn(),
  exportStorage: async (run: (io: unknown) => Promise<unknown>) =>
    run({
      exists: async (_key: string, token: string) =>
        source.exportToken === token,
      begin: async (_key: string, token: string) => {
        void _key;
        source.uploadToken = token;
        source.exportParts.clear();
        return "upload-test";
      },
      part: async (_key: string, _id: string, number: number, body: Buffer) => {
        if (source.exportToken)
          throw new Error("NoSuchUpload: already completed");
        source.exportParts.set(number, body.toString());
        return `part-${number}`;
      },
      finish: async (_key: string, _id: string) => {
        void _key;
        void _id;
        source.exportText = [...source.exportParts]
          .sort((a, b) => a[0] - b[0])
          .map((x) => x[1])
          .join("");
        source.exportToken = source.uploadToken;
        if (source.finishLost) {
          source.finishLost = false;
          throw new Error("Completion response lost");
        }
      },
    }),
}));
const modules = import.meta.glob("../**/*.ts");
const origin = "https://source.example";
const grid = (handles: string[], next?: string) =>
  `<main><h1>Collection</h1><div id="product-grid">${handles.map((h) => `<a href="/products/${h}">${h}</a>`).join("")}${!handles.length ? "No products" : ""}</div>${next ? `<a rel="next" href="${next}">Next</a>` : ""}</main>`;
const html =
  '<main><h1>Source title</h1><details><summary>Produktdetails</summary><div class="accordion__content"><p>23 cm</p></div></details></main>';
const json = (id: number, handle: string) =>
  JSON.stringify({
    product: {
      id,
      handle,
      title: `Title ${handle}`,
      body_html: "<p>German description</p>",
      tags: ["source-tag"],
      vendor: "Source",
      options: [{ name: "Title", values: ["Default Title"] }],
      variants: [
        {
          id: id * 10,
          title: "Default Title",
          price: "12.50",
          option1: "Default Title",
          unknown_variant_field: "preserve",
        },
      ],
      images: [],
      unknown_source_field: { keep: true },
    },
  });
beforeEach(() => {
  vi.useFakeTimers();
  source.pages.clear();
  source.failures.clear();
  source.calls.length = 0;
  source.exportParts.clear();
  source.exportText = "";
  source.exportToken = "";
  source.finishLost = false;
  source.pages.set(
    origin,
    '<!-- shopify --><header><nav><ul><li><a href="/pages/about">Group</a><ul><li><a href="/collections/cats">Cats</a></li></ul></li><li><a href="/products/a">Product</a></li></ul></nav></header>',
  );
  source.pages.set(
    `${origin}/sitemap.xml`,
    `<sitemapindex><sitemap><loc>${origin}/sitemap_products_1.xml</loc></sitemap><sitemap><loc>${origin}/sitemap_collections_1.xml</loc></sitemap></sitemapindex>`,
  );
  source.pages.set(
    `${origin}/sitemap_products_1.xml`,
    `<urlset>${["a", "b", "c", "d"].map((h) => `<url><loc>${origin}/products/${h}</loc></url>`).join("")}</urlset>`,
  );
  source.pages.set(
    `${origin}/sitemap_collections_1.xml`,
    `<urlset>${["cats", "dogs", "empty"].map((h) => `<url><loc>${origin}/collections/${h}</loc></url>`).join("")}</urlset>`,
  );
  source.pages.set(
    `${origin}/collections/all?sort_by=best-selling`,
    grid(["b", "a"], "/collections/all?sort_by=best-selling&page=2"),
  );
  source.pages.set(
    `${origin}/collections/all?sort_by=best-selling&page=2`,
    grid(["a", "c", "d"]),
  );
  source.pages.set(
    `${origin}/collections/cats?sort_by=best-selling`,
    grid(["a", "b"]),
  );
  source.pages.set(
    `${origin}/collections/dogs?sort_by=best-selling`,
    grid(["a", "c"]),
  );
  source.pages.set(
    `${origin}/collections/empty?sort_by=best-selling`,
    grid([]),
  );
  for (const [i, h] of ["a", "b", "c", "d"].entries()) {
    source.pages.set(`${origin}/products/${h}.json`, json(i + 1, h));
    source.pages.set(`${origin}/products/${h}`, html);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function setup(mode: "ALL" | "TOP_N" = "ALL", topN?: number, tagLanguage?: TagLanguage) {
  const t = convexTest(schema, modules),
    owner = await t.run((ctx) =>
      ctx.db.insert("users", { approvalStatus: "approved" }),
    ),
    user = t.withIdentity({ subject: owner });
  const id = await user.mutation(api.catalogues.create, {
    url: origin,
    mode,
    ...(tagLanguage ? { tagLanguage } : {}),
    ...(topN ? { topN } : {}),
  });
  const read = () => t.query(internal.catalogues.context, { id });
  const drain = async () => {
    for (let i = 0; i < 100; i++) {
      const c = (await read())!;
      if (c.status !== "working") return c;
      if (c.work && decode<Work>(c.work).retryAt)
        vi.setSystemTime(decode<Work>(c.work).retryAt! + 1);
      await t.action(internal.catalogueActions.work, {
        id,
        generation: c.generation,
      });
    }
    throw new Error("worker did not settle");
  };
  const validate = async () => {
    const c = (await read())!,
      s = decode<Structure>(c.structure);
    await user.mutation(api.catalogues.saveTags, {
      id,
      version: c.version,
      values: s.collections.map((col) => ({ key: col.key, tag: col.tag })),
      validate: true,
      collect: true,
    });
  };
  return { t, user, id, owner, read, drain, validate };
}
test("discovery keeps an explicitly empty Montessori collection and completes its memberships", async () => {
  const f = await setup();
  source.pages.set(
    `${origin}/collections/empty?sort_by=best-selling`,
    readFileSync(new URL("./fixtures/montessori-empty-collection.html", import.meta.url), "utf8"),
  );
  const c = await f.drain();
  expect(c.status).toBe("tags");
  expect(c.error).toBeUndefined();
  expect(decode<Structure>(c.structure).collections.find((col) => col.key === "empty"))
    .toMatchObject({ membership: "complete", count: 0, selectedCount: 0 });
  expect(c.total).toBe(4);
  await f.validate();
  expect((await f.drain()).complete).toBe(4);
  await f.user.mutation(api.catalogues.exportJson, { id: f.id, allowPartial: false });
  await f.drain();
  const exported = JSON.parse(source.exportText);
  expect(exported.products).toHaveLength(4);
  expect(exported.structure.collections.find((col: { key: string }) => col.key === "empty"))
    .toMatchObject({ membership: "complete", count: 0 });
});

test("caught worker errors log retries and final blockage with collection context", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const f = await setup();
  source.pages.set(`${origin}/collections/empty?sort_by=best-selling`, "<main>Loading products…</main>");
  const c = await f.drain();
  const failedUrl = `${origin}/collections/empty?sort_by=best-selling`;
  expect(c.status).toBe("blocked");
  expect(c.error).toContain(failedUrl);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenNthCalledWith(1, "catalogue.worker.retry", expect.objectContaining({
    catalogueId: f.id, phase: "members", attempt: 1, url: failedUrl,
  }));
  expect(error).toHaveBeenCalledWith("catalogue.worker.blocked", expect.objectContaining({
    catalogueId: f.id, generation: c.generation, origin, kind: "discover",
    phase: "members", attempt: 3, collectionKey: "empty", url: failedUrl,
    error: c.error, stack: expect.stringContaining("La grille est vide"),
  }));
  source.pages.set(failedUrl, readFileSync(new URL("./fixtures/montessori-empty-collection.html", import.meta.url), "utf8"));
  source.calls.length = 0;
  await f.user.mutation(api.catalogues.retry, { id: f.id });
  const resumed = await f.drain();
  expect(resumed.status).toBe("tags");
  expect(resumed.error).toBeUndefined();
  expect(resumed.generation).toBeGreaterThan(c.generation);
  expect(source.calls).toEqual([failedUrl]);
  expect(decode<Structure>(resumed.structure).collections.every((col) => col.membership === "complete"))
    .toBe(true);
});
test("CSV enforces authentication, ownership, partial acknowledgement and a stable catalogue", async () => {
  const f = await setup();
  let c = (await f.read())!;
  const request = () => ({ id: f.id, version: c.version, generation: c.generation, allowPartial: true, cursor: null });
  await expect(f.user.query(api.catalogues.exportCsvPage, request())).rejects.toThrow("fin du traitement");
  await f.drain();
  c = (await f.read())!;
  await expect(f.t.query(api.catalogues.exportCsvPage, request())).rejects.toThrow();
  const other = f.t.withIdentity({ subject: await f.t.run((ctx) => ctx.db.insert("users", { approvalStatus: "approved" })) });
  await expect(other.query(api.catalogues.exportCsvPage, request())).rejects.toThrow("inaccessible");
  await expect(f.user.query(api.catalogues.exportCsvPage, { ...request(), allowPartial: false })).rejects.toThrow("incomplet");
  await f.validate();
  await f.drain();
  c = (await f.read())!;
  await expect(f.user.query(api.catalogues.exportCsvPage, { ...request(), version: c.version - 1 })).rejects.toThrow("a changé");
  await expect(f.user.query(api.catalogues.exportCsvPage, { ...request(), generation: c.generation - 1 })).rejects.toThrow("a changé");
});

test("CSV exports effective values and skips excluded, failed, unselected and alias rows", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  await f.drain();
  const page = await f.t.query(internal.catalogues.page, { id: f.id, selected: true });
  const manual = page.page.find((p) => p.handle === "b")!;
  const excluded = page.page.find((p) => p.handle === "a")!;
  await f.user.mutation(api.catalogues.saveProduct, { id: f.id, productId: manual._id, version: (await f.read())!.version, override: { title: "Titre manuel", tags: ["été"] } });
  await f.user.mutation(api.catalogues.saveProduct, { id: f.id, productId: excluded._id, version: (await f.read())!.version, override: { excluded: true } });
  await f.t.run(async (ctx) => {
    await ctx.db.patch(page.page.find((p) => p.handle === "c")!._id, { state: "failed" });
    await ctx.db.patch(page.page.find((p) => p.handle === "d")!._id, { selected: false });
    const { _id, _creationTime, ...copy } = manual;
    void _creationTime;
    await ctx.db.insert("produits", { ...copy, handle: "alias", identity: "alias", aliasOf: _id });
  });
  const c = (await f.read())!;
  const result = await f.user.query(api.catalogues.exportCsvPage, { id: f.id, version: c.version, generation: c.generation, allowPartial: true, cursor: null });
  expect(result).toMatchObject({ scanned: 4, skipped: 3, isDone: true });
  expect(result.products).toHaveLength(1);
  expect(result.products[0]).toContain("Titre manuel,b,");
  expect(result.products[0]).toContain(",été,FALSE,draft,");
  expect((await f.read())!.exportKey).toBeUndefined();
});

test("CSV paginates beyond empty batches and refuses a changed version between pages", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  await f.drain();
  const page = await f.t.query(internal.catalogues.page, { id: f.id, selected: true });
  await f.t.run(async (ctx) => {
    const { _id, _creationTime, ...copy } = page.page[0];
    void _id; void _creationTime;
    for (let i = 0; i < 45; i++) await ctx.db.insert("produits", { ...copy, handle: `extra-${i}`, identity: `extra-${i}`, state: i < 40 ? "failed" : "complete" });
  });
  const c = (await f.read())!;
  const args = { id: f.id, version: c.version, generation: c.generation, allowPartial: true };
  let cursor: string | null = null, scanned = 0, exported = 0;
  do {
    const result: { scanned: number; products: string[]; isDone: boolean; continueCursor: string } = await f.user.query(api.catalogues.exportCsvPage, { ...args, cursor });
    expect(result.scanned).toBeLessThanOrEqual(20);
    scanned += result.scanned;
    exported += result.products.length;
    if (result.isDone) break;
    cursor = result.continueCursor;
  } while (cursor !== null);
  expect(scanned).toBe(49);
  expect(exported).toBe(9);
  await f.user.mutation(api.catalogues.saveProduct, { id: f.id, productId: page.page[0]._id, version: c.version, override: { title: "Modifié" } });
  await expect(f.user.query(api.catalogues.exportCsvPage, { ...args, cursor })).rejects.toThrow("a changé");
});

test("Top N is global, paginated, deduplicated, and never downloads unselected fiches", async () => {
  const { t, id, drain, validate } = await setup("TOP_N", 3);
  const c = await drain(),
    s = decode<Structure>(c.structure);
  expect(c.status).toBe("tags");
  expect(c.total).toBe(3);
  expect(c.sourceCount).toBe(4);
  expect(s.collections).toHaveLength(3);
  expect(s.collections.find((x) => x.key === "empty")?.selectedCount).toBe(0);
  expect(s.collections.filter((x) => x.outsideMenu)).toHaveLength(2);
  expect(s.menu).toHaveLength(1);
  expect(s.menu[0].url).toBeNull();
  expect(source.calls.some((x) => /\/products\//.test(x))).toBe(false);
  await validate();
  const ready = await drain();
  expect(ready.complete).toBe(3);
  expect(
    source.calls.filter((x) => x === `${origin}/products/a.json`),
  ).toHaveLength(1);
  expect(source.calls.some((x) => /\/products\/d/.test(x))).toBe(false);
  const page = await t.query(internal.catalogues.page, { id, selected: true });
  const a = page.page.find((x) => x.handle === "a")!;
  expect(a.collections).toEqual(["cats", "dogs"]);
  expect(JSON.parse(a.jsonSource!).product.unknown_source_field.keep).toBe(
    true,
  );
  expect(JSON.parse(a.data!).sections[0].html).toContain("23 cm");
});
test("HTML failure stays visible; bounded attempts preserve successes and retry only failed fiches", async () => {
  const { t, id, user, drain, validate, read } = await setup();
  source.failures.add(`${origin}/products/d`);
  await drain();
  await validate();
  const partial = await drain();
  expect(partial.complete).toBe(3);
  expect(partial.failed).toBe(1);
  expect(source.calls.filter((x) => x === `${origin}/products/d`)).toHaveLength(
    3,
  );
  expect(
    source.calls.filter((x) => x === `${origin}/products/d.json`),
  ).toHaveLength(1);
  source.failures.clear();
  await user.mutation(api.catalogues.retry, { id });
  await drain();
  expect((await read())?.complete).toBe(4);
  expect((await read())?.failed).toBe(0);
  expect(
    source.calls.filter((x) => x === `${origin}/products/a.json`),
  ).toHaveLength(1);
  const page = await t.query(internal.catalogues.page, { id, selected: true });
  expect(page.page.find((x) => x.handle === "d")?.collections).toEqual([]);
});
test("collection and retry accept product pages without h1 and preserve the successful JSON", async () => {
  const { t, id, user, drain, validate, read } = await setup();
  source.pages.set(`${origin}/products/d`, "<html><body>Unavailable</body></html>");
  await drain();
  await validate();
  expect((await drain()).failed).toBe(1);
  source.pages.set(
    `${origin}/products/d`,
    `<html lang="fr"><head><meta property="og:type" content="product"><meta property="og:title" content="Title d"><meta property="og:url" content="${origin}/products/d"></head><body><div>Title d</div></body></html>`,
  );
  await user.mutation(api.catalogues.retry, { id });
  const running = (await read())!;
  await t.mutation(internal.catalogues.claim, {
    id, generation: running.generation, token: "old-worker",
  });
  await t.mutation(internal.catalogues.restartCollection, {
    id, generation: running.generation,
  });
  const before = await t.query(internal.catalogues.page, { id, selected: true });
  const failed = before.page.find((p) => p.handle === "d")!;
  await expect(t.mutation(internal.catalogues.result, {
    id, generation: running.generation, token: "old-worker",
    productId: failed._id, state: "failed", attempts: 3,
  })).rejects.toThrow("périmée");
  await expect(t.mutation(internal.catalogues.restartCollection, {
    id, generation: running.generation,
  })).rejects.toThrow("périmée");
  await drain();
  expect((await read())?.complete).toBe(4);
  expect((await read())?.failed).toBe(0);
  expect(source.calls.filter((url) => url === `${origin}/products/d.json`)).toHaveLength(1);
  expect(source.calls.filter((url) => url === `${origin}/products/a`)).toHaveLength(1);
  const page = await t.query(internal.catalogues.page, { id, selected: true });
  const product = page.page.find((p) => p.handle === "d")!;
  expect(product.error).toBeUndefined();
  expect(JSON.parse(product.data!).htmlStatus).toBe("complete");
});
test.each(["import", "export", "discover"] as const)(
  "operator collection recovery refuses an active or blocked %s snapshot",
  async (kind) => {
    const f = await setup();
    await f.drain();
    await f.validate();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.id, {
        work: encode({ kind, phase: kind }), status: "blocked", failed: 1,
      });
    });
    const c = (await f.read())!;
    await expect(f.t.mutation(internal.catalogues.restartCollection, {
      id: f.id, generation: c.generation,
    })).rejects.toThrow("Seule une collecte");
    expect((await f.read())?.work).toBe(c.work);
    expect((await f.read())?.generation).toBe(c.generation);
  },
);
test("manual collection addition grows Top N without duplicates or refetching successes", async () => {
  const { t, id, user, drain, validate } = await setup("TOP_N", 1);
  await drain();
  await validate();
  await drain();
  await user.mutation(api.catalogues.addCollection, { id, key: "dogs" });
  const ready = await drain();
  expect(ready.total).toBe(3);
  expect(ready.complete).toBe(3);
  expect(
    source.calls.filter((x) => x === `${origin}/products/b.json`),
  ).toHaveLength(1);
  const page = await t.query(internal.catalogues.page, { id, selected: true });
  expect(page.page.find((x) => x.handle === "a")?.collections).toEqual([
    "cats",
    "dogs",
  ]);
});
test("tag confirmation, collisions, ownership, stale edits and stale workers are enforced server-side", async () => {
  const { t, id, user, drain, read } = await setup();
  const c = await drain(),
    s = decode<Structure>(c.structure);
  const other = t.withIdentity({
    subject: await t.run((ctx) =>
      ctx.db.insert("users", { approvalStatus: "approved" }),
    ),
  });
  await expect(other.query(api.catalogues.get, { id })).rejects.toThrow(
    "inaccessible",
  );
  await expect(
    user.mutation(api.catalogues.saveTags, {
      id,
      version: c.version,
      values: s.collections.map((x) => ({ key: x.key, tag: "duplicate" })),
      validate: true,
      collect: true,
    }),
  ).rejects.toThrow("plusieurs");
  await expect(
    user.mutation(api.catalogues.saveTags, {
      id,
      version: c.version,
      values: [],
      validate: false,
      collect: true,
    }),
  ).rejects.toThrow("Validez");
  await expect(
    t.mutation(internal.catalogues.checkpoint, {
      id,
      generation: 1,
      token: "old",
      work: encode({ kind: "collect", phase: "collect" }),
    }),
  ).rejects.toThrow("périmée");
  expect((await read())?.total).toBe(4);
});
test("tag language is selectable before discovery, editable during work, and used for all AI proposals", async () => {
  const f = await setup("ALL", undefined, "fr");
  expect((await f.read())?.tagLanguage).toBe("fr");
  await f.user.mutation(api.catalogues.setTagLanguage, {
    id: f.id, language: "de", tagVersion: 0,
  });
  await f.drain();
  expect(source.tagLanguages.at(-1)).toBe("de");
  await f.validate();
  await f.drain();
  const c = (await f.read())!, original = decode<Structure>(c.structure);
  await f.user.mutation(api.catalogues.setTagLanguage, {
    id: f.id, language: "fr", tagVersion: c.tagVersion!,
  });
  expect(decode<Structure>((await f.read())!.structure)).toEqual(original);
  const proposals = await f.user.action(api.catalogueActions.suggestTags, { id: f.id, replaceExisting: true });
  expect(proposals).toHaveLength(original.collections.length);
  expect(source.tagLanguages.at(-1)).toBe("fr");
  const legacy = await setup();
  expect((await legacy.read())?.tagLanguage).toBe("en");
});

test("collection tag changes reach lists, details and exports while drafts and manual product tags remain intact", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  await f.drain();
  const page = await f.t.query(internal.catalogues.page, { id: f.id, selected: true });
  const inherited = page.page.find((p) => p.handle === "a")!;
  const manual = page.page.find((p) => p.handle === "b")!;
  await f.user.mutation(api.catalogues.saveProduct, {
    id: f.id, productId: manual._id, version: (await f.read())!.version,
    override: { title: "Mon titre", tags: ["personnel"] },
  });
  const c = (await f.read())!;
  const values = decode<Structure>(c.structure).collections.map((col) => ({
    key: col.key, tag: col.key === "cats" ? "chats-d’été" : col.tag,
  }));
  // Apostrophes stay invalid; accented lowercase words are supported.
  expect(validCollectionTag(values[0].tag)).toBe(false);
  values.find((x) => x.key === "cats")!.tag = " chats-été , femme ";
  values.find((x) => x.key === "dogs")!.tag = "chiens, femme";
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: c.version, tagVersion: c.tagVersion,
    values, validate: false, collect: false,
  });
  let detail = decode<{ data: { tags: string[] } }>(await f.user.query(api.catalogues.product, { id: f.id, productId: inherited._id }));
  expect(detail.data.tags).toContain("cats");
  expect(detail.data.tags).not.toContain("chats-été");
  const draft = (await f.read())!;
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: draft.version, tagVersion: draft.tagVersion,
    values, validate: true, collect: false,
  });
  const applied = (await f.read())!;
  expect(applied.status).toBe("ready");
  expect(applied.generation).toBe(c.generation);
  expect(applied.work).toBeUndefined();
  detail = decode(await f.user.query(api.catalogues.product, { id: f.id, productId: inherited._id }));
  expect(detail.data.tags).toEqual(["chats-été", "chiens", "femme"]);
  expect(decode<Structure>(applied.structure).collections.find((col) => col.key === "cats")?.tag).toBe("chats-été, femme");
  const manualDetail = decode<{ data: { tags: string[]; title: string } }>(await f.user.query(api.catalogues.product, { id: f.id, productId: manual._id }));
  expect(manualDetail.data).toMatchObject({ tags: ["personnel"], title: "Mon titre" });
  expect((await f.t.query(internal.catalogues.byId, { id: inherited._id }))?.jsonSource).toBe(inherited.jsonSource);
  const list = await f.user.query(api.catalogues.products, { id: f.id, search: "", state: "", collection: "", sort: "rank", paginationOpts: { cursor: null, numItems: 25 } });
  expect(list.page.map((row) => decode<{ id: string; tags: string[] }>(row)).find((row) => row.id === inherited._id)?.tags).toEqual(detail.data.tags);
  const csv = await f.user.query(api.catalogues.exportCsvPage, { id: f.id, version: applied.version, generation: applied.generation, allowPartial: false, cursor: null });
  expect(csv.products.join("")).toContain('"chats-été, chiens, femme"');
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: applied.version, tagVersion: applied.tagVersion,
    values: [{ key: "cats", tag: "nouveau, brouillon" }], validate: false, collect: false,
  });
  detail = decode(await f.user.query(api.catalogues.product, { id: f.id, productId: inherited._id }));
  expect(detail.data.tags).toEqual(["chats-été", "chiens", "femme"]);
  await f.user.mutation(api.catalogues.exportJson, { id: f.id, allowPartial: false });
  await f.drain();
  const exported = JSON.parse(source.exportText);
  expect(exported.products.find((p: { url: string }) => p.url === inherited.url).data.tags).toEqual(detail.data.tags);
});

test("ignored collections need no tag, keep their products, and can be reactivated individually or in bulk", async () => {
  const f = await setup();
  const initial = await f.drain();
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: initial.version,
    values: [{ key: "cats", tag: "", ignored: true }, { key: "empty", tag: "", ignored: true }],
    validate: true, collect: false,
  });
  const proposals = await f.user.action(api.catalogueActions.suggestTags, { id: f.id, replaceExisting: true });
  expect(proposals.map((col) => col.key)).toEqual(["dogs"]);
  await f.validate();
  const collected = await f.drain();
  expect(collected).toMatchObject({ total: 4, complete: 4, failed: 0 });
  const page = await f.t.query(internal.catalogues.page, { id: f.id, selected: true });
  const onlyIgnored = page.page.find((p) => p.handle === "b")!;
  expect(onlyIgnored.collections).toEqual(["cats"]);
  const detail = decode<{ collections: string[]; data: { tags: string[]; collections: string[] } }>(await f.user.query(api.catalogues.product, { id: f.id, productId: onlyIgnored._id }));
  expect(detail).toMatchObject({ collections: [], data: { tags: [], collections: [] } });
  const none = await f.user.query(api.catalogues.products, { id: f.id, search: "", state: "", collection: "__none", sort: "rank", paginationOpts: { cursor: null, numItems: 25 } });
  expect(none.page.map((row) => decode<{ id: string }>(row).id)).toContain(onlyIgnored._id);
  const shared = page.page.find((p) => p.handle === "a")!;
  const sharedDetail = decode<{ data: { tags: string[]; collections: string[] } }>(await f.user.query(api.catalogues.product, { id: f.id, productId: shared._id }));
  expect(sharedDetail.data).toMatchObject({ tags: ["dogs"], collections: ["dogs"] });
  // Reactivation of a collection without a valid tag requires a correction.
  await expect(f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: collected.version, values: [{ key: "cats", tag: "", ignored: false }], validate: true, collect: false,
  })).rejects.toThrow("Saisissez au moins");
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: collected.version, values: [{ key: "cats", tag: "cats", ignored: false }, { key: "empty", tag: "empty", ignored: false }], validate: true, collect: false,
  });
  const restored = decode<{ collections: string[]; data: { tags: string[] } }>(await f.user.query(api.catalogues.product, { id: f.id, productId: onlyIgnored._id }));
  expect(restored).toMatchObject({ collections: ["cats"], data: { tags: ["cats"] } });
  expect((await f.read())!).toMatchObject({ total: 4, complete: 4, generation: collected.generation });
});

test("ignoring all collections preserves collection of every product and snapshots carry only active associations", async () => {
  const f = await setup();
  const c = await f.drain();
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: c.version,
    values: decode<Structure>(c.structure).collections.map((col) => ({ key: col.key, tag: "", ignored: true })),
    validate: true, collect: true,
  });
  const ready = await f.drain();
  expect(ready).toMatchObject({ total: 4, complete: 4 });
  const page = await f.t.query(internal.catalogues.page, { id: f.id, selected: true });
  const manual = page.page.find((p) => p.handle === "a")!;
  await f.user.mutation(api.catalogues.saveProduct, { id: f.id, productId: manual._id, version: ready.version, override: { tags: ["personnel"] } });
  const snapshot = (await f.read())!;
  const csv = await f.user.query(api.catalogues.exportCsvPage, { id: f.id, version: snapshot.version, generation: snapshot.generation, allowPartial: false, cursor: null });
  expect(csv.products).toHaveLength(4);
  expect(csv.products.join("")).toContain("personnel");
  await f.user.mutation(api.catalogues.exportJson, { id: f.id, allowPartial: false });
  await f.drain();
  const exported = JSON.parse(source.exportText);
  expect(exported.products).toHaveLength(4);
  for (const p of exported.products) expect(p).toMatchObject({ collections: [], data: { collections: [] } });
  expect(exported.products.find((p: { url: string }) => p.url === manual.url)).toMatchObject({ sourceCollections: ["cats", "dogs"], data: { tags: ["personnel"] } });
  expect(exported.structure.collections.every((col: { ignored?: boolean }) => col.ignored)).toBe(true);
});

test("in-flight workers preserve saved tags and accept tag edits despite discovery progress", async () => {
  const f = await setup();
  const c = await f.drain(), snapshot = decode<Structure>(c.structure);
  await f.t.run((ctx) => ctx.db.patch(f.id, {
    status: "working", work: encode({ kind: "discover", phase: "members" }), version: c.version + 1,
  }));
  const fence = { id: f.id, generation: c.generation, token: "tag-worker" };
  await f.t.mutation(internal.catalogues.claim, fence);
  await f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: c.version, tagVersion: c.tagVersion,
    values: [{ key: "cats", tag: "chats", ignored: true }], validate: true, collect: false,
  });
  await f.t.mutation(internal.catalogues.checkpoint, {
    ...fence, structure: encode(snapshot), status: "tags",
  });
  const changed = (await f.read())!;
  expect(decode<Structure>(changed.structure).collections.find((x) => x.key === "cats")).toMatchObject({ tag: "chats", ignored: true, validated: false });
  await expect(f.user.mutation(api.catalogues.saveTags, {
    id: f.id, version: changed.version, tagVersion: c.tagVersion,
    values: [{ key: "cats", tag: "autre" }], validate: true, collect: false,
  })).rejects.toThrow("changé");
});

test("obsolete automatic AI proposals are retried after a language change", async () => {
  const f = await setup();
  const c = await f.drain();
  const snapshot = decode<Structure>(c.structure);
  await f.t.run((ctx) => ctx.db.patch(f.id, { status: "working", work: encode({ kind: "discover", phase: "suggest" }) }));
  const fence = { id: f.id, generation: c.generation, token: "ai-worker" };
  await f.t.mutation(internal.catalogues.claim, fence);
  await f.user.mutation(api.catalogues.setTagLanguage, { id: f.id, language: "fr", tagVersion: c.tagVersion! });
  snapshot.collections[0].tag = "obsolete-english";
  await f.t.mutation(internal.catalogues.checkpoint, {
    ...fence, structure: encode(snapshot), status: "tags", suggestedLanguage: "en",
  });
  const changed = (await f.read())!;
  expect(changed.status).toBe("working");
  expect(changed.lease).toBeUndefined();
  expect(decode<Structure>(changed.structure).collections[0].tag).not.toBe("obsolete-english");
  await f.drain();
  expect(source.tagLanguages.at(-1)).toBe("fr");
});

test("tag edits enforce ownership, normalized uniqueness, and import/export snapshot locks", async () => {
  const f = await setup();
  const c = await f.drain();
  const other = f.t.withIdentity({ subject: await f.t.run((ctx) => ctx.db.insert("users", { approvalStatus: "approved" })) });
  await expect(other.mutation(api.catalogues.setTagLanguage, { id: f.id, language: "fr", tagVersion: c.tagVersion! })).rejects.toThrow("inaccessible");
  await expect(other.mutation(api.catalogues.saveTags, { id: f.id, version: c.version, values: [{ key: "cats", tag: "", ignored: true }], validate: false, collect: false })).rejects.toThrow("inaccessible");
  const values = decode<Structure>(c.structure).collections.map((col, i) => ({ key: col.key, tag: i === 0 ? "été" : i === 1 ? "e\u0301te\u0301" : col.tag }));
  await expect(f.user.mutation(api.catalogues.saveTags, { id: f.id, version: c.version, values, validate: true, collect: false })).rejects.toThrow("plusieurs");
  const combinations = values.map((value, i) => ({ ...value, tag: i === 0 ? "mocassins, été" : i === 1 ? "e\u0301te\u0301, mocassins" : value.tag }));
  await expect(f.user.mutation(api.catalogues.saveTags, { id: f.id, version: c.version, values: combinations, validate: true, collect: false })).rejects.toThrow("plusieurs");
  await expect(f.user.mutation(api.catalogues.saveTags, { id: f.id, version: c.version, values: [{ key: "cats", tag: "mocassins,,femme" }], validate: true, collect: false })).rejects.toThrow("non vide");
  for (const kind of ["export", "import"] as const) {
    await f.t.run((ctx) => ctx.db.patch(f.id, { status: "blocked", work: encode({ kind, phase: "setup" }) }));
    await expect(f.user.mutation(api.catalogues.setTagLanguage, { id: f.id, language: "fr", tagVersion: c.tagVersion! })).rejects.toThrow("figés");
    await expect(f.user.mutation(api.catalogues.saveTags, { id: f.id, version: c.version, values: [{ key: "cats", tag: "", ignored: true }], validate: false, collect: false })).rejects.toThrow("figés");
  }
  for (const tag of ["été", "mocassins-femme", "plüschtiere", "ぬいぐるみ", "ألعاب"]) expect(validCollectionTag(tag)).toBe(true);
  for (const tag of ["", "Été", "tag,tag", "-tag", "tag  tag", "a".repeat(101)]) expect(validCollectionTag(tag)).toBe(false);
});

test("worker replay merges URL discovery and does not double counters", async () => {
  const { t, id } = await setup();
  const fence = { id, generation: 1, token: "lease" };
  await t.mutation(internal.catalogues.claim, fence);
  const links = [
    { handle: "a", url: `${origin}/products/a`, selected: true, sitemap: true },
  ];
  await t.mutation(internal.catalogues.links, { ...fence, links });
  await t.mutation(internal.catalogues.links, { ...fence, links });
  const c = await t.query(internal.catalogues.context, { id });
  expect(c?.total).toBe(1);
  expect(c?.sourceCount).toBe(1);
});
test("edits preserve source JSON, reject concurrent changes, and invalidate an export", async () => {
  const { t, id, user, drain, validate, read } = await setup("TOP_N", 1);
  await drain();
  await validate();
  await drain();
  const page = await t.query(internal.catalogues.page, { id, selected: true }),
    p = page.page[0],
    c = (await read())!;
  await t.run((ctx) =>
    ctx.db.patch(id, {
      exportKey: `catalogues/${id}/catalogue.json`,
      exportVersion: c.version,
    }),
  );
  await user.mutation(api.catalogues.saveProduct, {
    id,
    productId: p._id,
    version: c.version,
    override: { title: "Manual", tags: ["handmade"] },
  });
  const changed = await t.query(internal.catalogues.byId, { id: p._id });
  expect(changed?.jsonSource).toBe(p.jsonSource);
  expect(changed?.title).toBe("Manual");
  expect((await read())?.exportVersion).not.toBe((await read())?.version);
  await expect(
    user.mutation(api.catalogues.saveProduct, {
      id,
      productId: p._id,
      version: c.version,
      override: {},
    }),
  ).rejects.toThrow("changé");
});
test("rank unavailability never falls back to sitemap order", async () => {
  const { drain } = await setup("TOP_N", 2);
  source.failures.add(`${origin}/collections/all?sort_by=best-selling`);
  const c = await drain();
  expect(c.status).toBe("blocked");
  expect(c.total).toBe(0);
  expect(decode<Work>(c.work!).phase).toBe("ranking");
});
test("partial export and Shopify import require explicit acknowledgement", async () => {
  const { id, user, drain, validate } = await setup();
  source.failures.add(`${origin}/products/d`);
  await drain();
  await validate();
  await drain();
  await expect(
    user.mutation(api.catalogues.exportJson, { id, allowPartial: false }),
  ).rejects.toThrow("incomplet");
});
describe("source fidelity and menu projection", () => {
  test("source values and manual tags have a single effective resolver", () => {
    const p = extractProduct(
      { handle: "a", url: `${origin}/products/a`, collections: ["cats"] },
      JSON.parse(json(1, "a")),
      html,
    );
    const s: Structure = {
      menu: [],
      warnings: [],
      collections: [
        {
          key: "cats",
          url: "",
          title: "Cats",
          description: "",
          image: null,
          tag: "cat",
          validated: true,
          outsideMenu: false,
          membership: "complete",
          count: 1,
          selectedCount: 1,
        },
      ],
    };
    expect(effective(p, s).tags).toEqual(["cat"]);
    expect(effective(p, s, { tags: ["manual"] }).tags).toEqual(["manual"]);
  });
  test("menu strips pages/products/external URLs but preserves structural labels and empty collections", () => {
    const menu = collectionMenu(
      [
        {
          key: "root",
          title: "Group",
          url: `${origin}/pages/about`,
          children: [
            {
              key: "c",
              title: "Cats",
              url: `${origin}/collections/cats`,
              children: [],
            },
          ],
        },
        {
          key: "x",
          title: "Product",
          url: `${origin}/products/a`,
          children: [],
        },
      ],
      origin,
    );
    const output = targetMenu(
      { menu, collections: [], warnings: [] },
      { cats: { id: "gid://shopify/Collection/1", handle: "cats" } },
      origin,
    ) as Array<{ url: string; items: unknown[] }>;
    expect(output).toHaveLength(1);
    expect(output[0].url).toBe("#");
    expect(output[0].items).toHaveLength(1);
  });
  test("ignored menu parents become groups, ignored leaves and empty groups disappear", () => {
    const ignored = { key: "cats", ignored: true } as Structure["collections"][number];
    const leaf = { key: "cats", title: "Cats", url: `${origin}/collections/cats`, children: [] };
    const structure: Structure = { collections: [ignored], warnings: [], menu: [
      { ...leaf, children: [{ key: "dogs", title: "Dogs", url: `${origin}/collections/dogs`, children: [] }] },
      { ...leaf, key: "ignored-leaf" },
      { key: "group", title: "Empty group", url: null, children: [leaf] },
    ] };
    expect(effectiveMenu(structure, origin)).toEqual([{ ...leaf, url: null, children: structure.menu[0].children }]);
    expect(targetMenu(structure, { dogs: { id: "gid://shopify/Collection/2", handle: "dogs" } }, origin)).toEqual([
      { title: "Cats", type: "HTTP", url: "#", items: [{ title: "Dogs", type: "COLLECTION", resourceId: "gid://shopify/Collection/2", items: [] }] },
    ]);
  });
  test("oversized data is rejected without truncation", () =>
    expect(() => guardSize({ raw: "x".repeat(950_000) })).toThrow("tronquée"));
});

test("one streamed JSON retains all source fields and manual overrides", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  const c = await f.drain();
  await f.user.mutation(api.catalogues.exportJson, {
    id: f.id,
    allowPartial: false,
  });
  const exported = await f.drain();
  expect(exported.exportVersion).toBe(c.version);
  expect(exported.exportKey).toBe(`catalogues/${f.id}/catalogue.json`);
  const json = JSON.parse(source.exportText);
  expect(json.products).toHaveLength(4);
  expect(json.products[0].jsonSource.product.unknown_source_field.keep).toBe(
    true,
  );
  expect(JSON.parse(json.products[0].jsonSourceText)).toEqual(
    json.products[0].jsonSource,
  );
  expect(json.products[0].data.sections[0].html).toContain("23 cm");
});
test("source identity aliases merge memberships and a replay cannot decrement totals twice", async () => {
  source.pages.set(`${origin}/products/c.json`, json(1, "c"));
  const f = await setup();
  await f.drain();
  await f.validate();
  const c = await f.drain();
  expect(c.total).toBe(3);
  expect(c.complete).toBe(3);
  expect(c.failed).toBe(0);
  const products = await f.t.query(internal.catalogues.page, {
    id: f.id,
    selected: true,
  });
  expect(
    products.page.filter((p) => p.identity === "source.example:1"),
  ).toHaveLength(1);
  expect(
    products.page.find((p) => p.identity === "source.example:1")?.collections,
  ).toEqual(["cats", "dogs"]);
  await f.user.mutation(api.catalogues.addCollection, {
    id: f.id,
    key: "dogs",
  });
  const replay = await f.drain();
  expect(replay.total).toBe(3);
  expect(replay.complete).toBe(3);
  expect(replay.sourceCount).toBe(3);
});

test("multipart export resumes across actions and reconciles a lost completion response", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  await f.drain();
  await f.t.run(async (ctx) => {
    const sourceProduct = (await ctx.db
      .query("produits")
      .withIndex("by_catalogue_handle", (q) => q.eq("catalogueId", f.id))
      .first())!;
    const { _id, _creationTime, ...p } = sourceProduct;
    void _id;
    void _creationTime;
    for (let n = 0; n < 25; n++)
      await ctx.db.insert("produits", {
        ...p,
        handle: `large-${n}`,
        identity: `large-${n}`,
        jsonSource: JSON.stringify({
          product: { id: n, large: "x".repeat(250_000) },
        }),
      });
    await ctx.db.patch(f.id, { total: 29, complete: 29 });
  });
  await f.user.mutation(api.catalogues.exportJson, {
    id: f.id,
    allowPartial: false,
  });
  const start = (await f.read())!;
  await f.t.action(internal.catalogueActions.work, {
    id: f.id,
    generation: start.generation,
  });
  expect(decode<Work>((await f.read())!.work!).upload?.parts).toHaveLength(1);
  source.finishLost = true;
  const result = await f.drain();
  expect(result.work).toBeUndefined();
  const json = JSON.parse(source.exportText);
  expect(json.products).toHaveLength(29);
  expect(
    new Set(json.products.map((p: { identity: string }) => p.identity)).size,
  ).toBe(29);
  expect(source.exportParts.size).toBeGreaterThan(1);
});

test("real JSON and HTML fixture preserves language, variants and the three complementary sections", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/kuscheltierland.json", import.meta.url),
      "utf8",
    ),
  );
  const html = readFileSync(
    new URL("./fixtures/kuscheltierland.html", import.meta.url),
    "utf8",
  );
  const p = extractProduct(
    {
      handle: raw.product.handle,
      url: `https://www.kuscheltierland.de/products/${raw.product.handle}`,
      collections: [],
    },
    raw,
    html,
  );
  expect(p.jsonStatus).toBe("complete");
  expect(p.htmlStatus).toBe("complete");
  expect(p.contentLanguage).toBe("");
  expect(
    extractProduct(
      { handle: p.handle, url: p.url, collections: [] },
      raw,
      html.replace("<html>", '<html lang="de">'),
    ).contentLanguage,
  ).toBe("de");
  expect(p.variants).toHaveLength(raw.product.variants.length);
  expect(p.images).toHaveLength(raw.product.images.length);
  expect(p.seo.title).not.toContain("American Express");
  expect(p.seo.title).toContain(raw.product.title);
  expect(p.sections.map((s) => s.title.toLowerCase())).toEqual(
    expect.arrayContaining([
      "pflege",
      "produktdetails",
      "hinweise zur verwendung",
    ]),
  );
  expect(
    cleanHtml(
      '<script>alert(1)</script><p onclick="x()"><a href="javascript:alert(1)">Text</a></p>',
    ),
  ).toBe("<p><a>Text</a></p>");
});
test("empty filtered pages remain bounded and exact substring matches are found through continuation", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  await f.drain();
  const page = await f.t.query(internal.catalogues.page, {
    id: f.id,
    selected: true,
  });
  const p = page.page[0];
  await f.user.mutation(api.catalogues.saveProduct, {
    id: f.id,
    productId: p._id,
    version: (await f.read())!.version,
    override: { title: "Äpfel, VOGEL—23 cm" },
  });
  const args = {
    id: f.id,
    search: "FEL, vogel—23",
    collection: "",
    state: "",
    sort: "rank" as const,
  };
  let cursor: string | null = null;
  const items: unknown[] = [];
  let scanned = 0;
  do {
    const result: PaginationResult<string> = await f.user.query(
      api.catalogues.products,
      {
        ...args,
        paginationOpts: { numItems: 1, cursor },
      },
    );
    expect(result.page.length).toBeLessThanOrEqual(1);
    items.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
    if (++scanned > 10) throw new Error("pagination loop");
  } while (cursor);
  expect(items).toHaveLength(1);
});
test("a collection with 40 scattered products retains every match across bounded batches", async () => {
  const f = await setup();
  await f.drain();
  await f.t.run(async (ctx) => {
    // Rank 2 is the only match among the first 25, as in the reported bug.
    for (let i = 0; i < 964; i++) {
      const handle = `pagination-${i.toString().padStart(4, "0")}`;
      await ctx.db.insert("produits", {
        catalogueId: f.id,
        identity: handle,
        handle,
        url: `${origin}/products/${handle}`,
        selected: true,
        collections: i < 960 && i % 24 === 1 ? ["capybara"] : [],
        group: "capybara",
        rank: i + 1,
        title: handle,
        titleLower: handle,
        state: "complete",
        attempts: 0,
        inSitemap: true,
      });
    }
  });
  let cursor: string | null = null;
  const matches: Array<{ id: string; rank: number }> = [];
  let calls = 0;
  do {
    const result: PaginationResult<string> = await f.user.query(
      api.catalogues.products,
      {
        id: f.id,
        search: "",
        collection: "capybara",
        state: "",
        sort: "rank",
        paginationOpts: { numItems: 25, cursor },
      },
    );
    expect(result.page.length).toBeLessThanOrEqual(25);
    if (calls === 0) expect(result.page).toHaveLength(1);
    matches.push(...result.page.map((row) => JSON.parse(row)));
    if (!result.isDone) expect(result.continueCursor).not.toBe(cursor);
    cursor = result.isDone ? null : result.continueCursor;
    if (++calls > 45) throw new Error("pagination did not terminate");
  } while (cursor);
  expect(matches).toHaveLength(40);
  expect(new Set(matches.map((row) => row.id)).size).toBe(40);
  expect(matches.map((row) => row.rank)).toEqual(
    Array.from({ length: 40 }, (_, i) => 2 + i * 24),
  );
});
test("menu collection links tolerate the canonical www alias without preserving external links", () => {
  const menu = collectionMenu(
    [
      {
        key: "c",
        title: "Collection",
        url: "https://www.source.example/collections/cats",
        children: [],
      },
      {
        key: "x",
        title: "External",
        url: "https://external.example/collections/cats",
        children: [],
      },
    ],
    origin,
  );
  expect(menu).toHaveLength(1);
  expect(menu[0].url).toBe(`${origin}/collections/cats`);
});

test("Top N replaces aliases with the next globally ranked distinct product", async () => {
  source.pages.set(`${origin}/products/c.json`, json(1, "c"));
  const f = await setup("TOP_N", 3);
  await f.drain();
  await f.validate();
  const c = await f.drain();
  expect(c.total).toBe(3);
  expect(c.complete).toBe(3);
  const p = await f.t.query(internal.catalogues.page, {
    id: f.id,
    selected: true,
  });
  expect(p.page.map((x) => x.handle).sort()).toEqual(["a", "b", "d"]);
});

test("Top N continues the deferred ranking page when all initially selected handles are aliases", async () => {
  source.pages.set(`${origin}/products/b.json`, json(1, "b"));
  const f = await setup("TOP_N", 2);
  await f.drain();
  await f.validate();
  const c = await f.drain();
  expect(c.total).toBe(2);
  expect(c.complete).toBe(2);
  const p = await f.t.query(internal.catalogues.page, {
    id: f.id,
    selected: true,
  });
  expect(p.page.map((x) => x.handle).sort()).toEqual(["a", "c"]);
  expect(
    source.calls.filter((x) => x.endsWith("/products/d.json")),
  ).toHaveLength(0);
});

test("a syntactically valid but malformed product JSON is fetched again on retry", async () => {
  const f = await setup();
  await f.drain();
  await f.validate();
  source.pages.set(
    `${origin}/products/a.json`,
    JSON.stringify({ product: { id: 1, title: "Malformed", variants: [] } }),
  );
  const c = (await f.read())!;
  await f.t.action(internal.catalogueActions.work, {
    id: f.id,
    generation: c.generation,
  });
  const interim = await f.t.query(internal.catalogues.page, {
    id: f.id,
    selected: true,
  });
  const malformed = interim.page.find((p) => p.handle === "a")!;
  expect(JSON.parse(malformed.data!).jsonStatus).toBe("failed");
  expect(JSON.parse(malformed.data!).htmlStatus).toBe("complete");
  source.pages.set(`${origin}/products/a.json`, json(1, "a"));
  const ready = await f.drain();
  expect(ready.complete).toBe(4);
  expect(ready.failed).toBe(0);
  expect(
    source.calls.filter((x) => x === `${origin}/products/a.json`),
  ).toHaveLength(2);
});
