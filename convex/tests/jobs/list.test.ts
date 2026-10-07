/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");

async function fixture(bytesRead = 16 * 1024 * 1024) {
  const t = convexTest({ schema, modules, transactionLimits: { bytesRead } });
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { approvalStatus: "approved" });
    const shopId = await ctx.db.insert("shops", {
      domain: "list.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    const otherShopId = await ctx.db.insert("shops", {
      domain: "other.myshopify.com", createdByUserId: userId, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.patch(userId, { activeShopId: shopId });
    const productId = await ctx.db.insert("products", {
      shopId, shopifyProductId: "p1", title: "Curtain", handle: "curtain",
      tags: [], collections: [], options: [], variants: [], metafields: [],
      currentShopifyImages: [], generationStatus: "ready", createdAt: 1, updatedAt: 1,
    });
    return { userId, shopId, otherShopId, productId };
  });
  const job = {
    shopId: ids.shopId, status: "completed", mode: "bulk", executionMode: "batch",
    imageProvider: "openai", productIds: [ids.productId], selectedImageTypes: ["hero"],
    forceRegenerate: false, totalTasks: 900, completedTasks: 900, failedTasks: 0,
    generationCost: 45, inputTokens: 1000, outputTokens: 2000, pricedImageCount: 900,
    reviewTotal: 900, reviewPending: 900, reviewApproved: 0, reviewRejected: 0,
    createdAt: 1, updatedAt: 1,
  } satisfies Omit<Doc<"generationJobs">, "_id" | "_creationTime">;
  return { t, client: t.withIdentity({ subject: ids.userId }), job, ...ids };
}

afterEach(() => vi.unstubAllEnvs());

describe("generation history read limits", () => {
  test("lists four 900-image bulks without reading their >16 MiB image payloads", async () => {
    const { t, client, job, productId } = await fixture();
    const jobIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 4; i++) {
        ids.push(await ctx.db.insert("generationJobs", { ...job, createdAt: i + 1 }));
      }
      return ids;
    });
    // Realistic stored prompts: the old list query loaded every row for every
    // displayed bulk. Enforce Convex's actual transaction budget in this test.
    const promptUsed = "x".repeat(6500);
    expect(jobIds.length * 900 * promptUsed.length).toBeGreaterThan(16 * 1024 * 1024);
    for (const jobId of jobIds) {
      for (let offset = 0; offset < 900; offset += 100) {
        await t.run(async (ctx) => {
          for (let i = 0; i < 100; i++) {
            await ctx.db.insert("generatedImages", {
              shopId: job.shopId, productId, jobId, imageType: "hero", promptUsed,
              status: "generated", storageUrl: "https://example.com/image.png",
              createdAt: offset + i, updatedAt: offset + i,
            });
          }
        });
      }
    }
    const result = await client.query(ctx => ctx.runQuery(api.jobs.list, {}, {
      transactionLimits: { bytesRead: 64 * 1024 },
    }));
    expect(result.page.map(row => row._id)).toEqual([...jobIds].reverse());
    expect(result.hasNext).toBe(false);
    expect(result.page.every(row => row.completedTasks === 900)).toBe(true);
    expect(result.page[0].costSummary.generationCost).toBe(45);
    // Costs use the same stored summaries for these current jobs.
    expect((await client.query(api.jobs.costSummary, {})).totalCost).toBe(180);
  });

  test("keeps offset pagination, filters, hidden jobs and legacy shop scope", async () => {
    vi.stubEnv("SHOPIFY_SHOP_DOMAIN", "list.myshopify.com");
    const { t, client, job, otherShopId } = await fixture(64 * 1024);
    const ids = await t.run(async (ctx) => {
      const oldest = await ctx.db.insert("generationJobs", { ...job, createdAt: 1 });
      const legacy = await ctx.db.insert("generationJobs", {
        ...job, shopId: undefined, imageProvider: "gemini", createdAt: 2,
      });
      const newest = await ctx.db.insert("generationJobs", {
        ...job, status: "running", completedTasks: 123, failedTasks: 7, createdAt: 3,
      });
      await ctx.db.insert("generationJobs", { ...job, isHidden: true, createdAt: 4 });
      await ctx.db.insert("generationJobs", { ...job, shopId: otherShopId, createdAt: 5 });
      return { oldest, legacy, newest };
    });
    const first = await client.query(api.jobs.list, { limit: 2 });
    expect(first.page.map(row => row._id)).toEqual([ids.newest, ids.legacy]);
    expect(first).toMatchObject({ offset: 0, limit: 2, hasPrevious: false, hasNext: true });
    expect(first.page[0]).toMatchObject({ status: "running", completedTasks: 123, failedTasks: 7 });
    const second = await client.query(api.jobs.list, { offset: 2, limit: 2 });
    expect(second.page.map(row => row._id)).toEqual([ids.oldest]);
    expect(second).toMatchObject({ hasPrevious: true, hasNext: false });
    expect((await client.query(api.jobs.list, { provider: "gemini" })).page.map(row => row._id))
      .toEqual([ids.legacy]);
    expect((await client.query(api.jobs.list, {
      status: "running", executionMode: "batch", review: "to-review", productId: job.productIds[0],
    })).page.map(row => row._id)).toEqual([ids.newest]);
    vi.stubEnv("SHOPIFY_SHOP_DOMAIN", "other.myshopify.com");
    expect((await client.query(api.jobs.list, {})).page.map(row => row._id))
      .toEqual([ids.newest, ids.oldest]);
  });

  test("keeps legacy jobs without optional summaries or execution mode readable", async () => {
    vi.stubEnv("SHOPIFY_SHOP_DOMAIN", "list.myshopify.com");
    const { t, client, job } = await fixture(64 * 1024);
    const jobId = await t.run(ctx => ctx.db.insert("generationJobs", {
      ...job, shopId: undefined, executionMode: undefined, imageProvider: "gemini",
      generationCost: undefined, inputTokens: undefined, outputTokens: undefined,
      pricedImageCount: undefined, reviewTotal: undefined, reviewPending: undefined,
      reviewApproved: undefined, reviewRejected: undefined,
    }));
    const result = await client.query(api.jobs.list, { executionMode: "realtime", review: "no-review" });
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({
      _id: jobId, completedTasks: 900,
      costSummary: { generationCost: 0, inputTokens: 0, outputTokens: 0, pricedImageCount: 0 },
      reviewSummary: { total: 0, pending: 0, approved: 0, rejected: 0 },
    });
  });

  test("requires an approved authenticated user", async () => {
    const { t } = await fixture();
    await expect(t.query(api.jobs.list, {})).rejects.toThrow("Authentication required");
    const userId = await t.run(ctx => ctx.db.insert("users", { approvalStatus: "pending" }));
    await expect(t.withIdentity({ subject: userId }).query(api.jobs.list, {}))
      .rejects.toThrow("waiting for admin approval");
  });

  test("reads only the active shop even when other shops have a large newer history", async () => {
    vi.stubEnv("SHOPIFY_SHOP_DOMAIN", "");
    const { t, client, job, otherShopId } = await fixture(64 * 1024);
    const jobId = await t.run(async ctx => {
      const id = await ctx.db.insert("generationJobs", job);
      for (let i = 0; i < 100; i++) {
        await ctx.db.insert("generationJobs", {
          ...job, shopId: otherShopId, createdAt: i + 2, error: "x".repeat(8000),
        });
      }
      return id;
    });
    expect((await client.query(api.jobs.list, {})).page.map(row => row._id)).toEqual([jobId]);
  });
});
