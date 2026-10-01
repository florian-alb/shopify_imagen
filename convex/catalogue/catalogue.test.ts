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
  collectionMenu,
  type Structure,
  type Work,
} from "./model";
import { extractProduct, cleanHtml } from "./extract";
import { readFileSync } from "node:fs";
import { targetMenu } from "./shopify";

const source = vi.hoisted(() => ({
  pages: new Map<string, string>(),
  failures: new Set<string>(),
  calls: [] as string[],
  exportParts: new Map<number, string>(),
  exportText: "",
  exportToken: "",
  uploadToken: "",
  finishLost: false,
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
  proposeTags: async (cols: Array<{ key: string }>) =>
    cols.map((c) => ({ key: c.key, tag: c.key })),
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
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function setup(mode: "ALL" | "TOP_N" = "ALL", topN?: number) {
  const t = convexTest(schema, modules),
    owner = await t.run((ctx) =>
      ctx.db.insert("users", { approvalStatus: "approved" }),
    ),
    user = t.withIdentity({ subject: owner });
  const id = await user.mutation(api.catalogues.create, {
    url: origin,
    mode,
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
