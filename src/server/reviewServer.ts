import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config } from "../config.js";
import { listProducts } from "../shopify/adminApi.js";
import { readState } from "../storage/state.js";
import { replaceProductImagesWithGenerated } from "../workflows/attachGeneratedImages.js";
import { exportProductImages } from "../workflows/exportProductImages.js";
import { generateProductImages } from "../workflows/generateProductImages.js";
import type { ShopifyProduct } from "../types.js";

type ReviewProduct = {
  id: string;
  title: string;
  handle: string;
  productType: string | null;
  vendor: string | null;
  collections: Array<{ id: string; title: string; handle: string }>;
  stateStatus: string | null;
  currentImages: Array<{ url: string; altText: string | null; mediaId: string | number | null }>;
  generatedImages: Array<{ imageType: string; label: string; url: string; localPath: string }>;
  requestedImageTypes: string[];
  availableFixations: string[];
  error: string | null;
  updatedAt: string | null;
};

type GenerationJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  productIds: string[];
  concurrency: number;
  budget: boolean;
  force: boolean;
  completed: number;
  total: number;
  currentProduct: string | null;
  messages: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const staticDir = path.resolve("dist/review-ui");
const jobs = new Map<string, GenerationJob>();

function imageTypeLabel(pathOrType: string): string {
  return path.basename(pathOrType).replace(/^[^_]+_\d+_/, "").replace(/\.[^.]+$/, "");
}

function isInsideDownloadsDir(localPath: string): boolean {
  const relativePath = path.relative(config.downloadsDir, localPath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function localImageUrl(localPath: string): string {
  return `/local-image?path=${encodeURIComponent(localPath)}`;
}

function serializeProduct(product: ShopifyProduct): ReviewProduct {
  const state = readState()[String(product.id)];
  const generatedImages = Object.entries(state?.generatedImages ?? {})
    .filter(([, localPath]) => fs.existsSync(localPath))
    .map(([imageType, localPath]) => ({
      imageType,
      label: imageTypeLabel(imageType),
      url: localImageUrl(localPath),
      localPath
    }));

  return {
    id: String(product.id),
    title: product.title,
    handle: product.handle,
    productType: product.productType ?? null,
    vendor: product.vendor ?? null,
    collections: product.collections ?? [],
    stateStatus: state?.status ?? null,
    currentImages: (product.images ?? [])
      .map((image) => ({
        url: image.url ?? image.src ?? "",
        altText: image.altText ?? null,
        mediaId: image.mediaId ?? image.id ?? null
      }))
      .filter((image) => Boolean(image.url)),
    generatedImages,
    requestedImageTypes: state?.requestedImageTypes ?? [],
    availableFixations: state?.availableFixations ?? [],
    error: state?.error ?? null,
    updatedAt: state?.updatedAt ?? null
  };
}

async function listReviewProducts(limit: number, query?: string): Promise<ReviewProduct[]> {
  const products = await listProducts({ limit, query });
  return products.map(serializeProduct);
}

async function listRawProducts(limit: number, query?: string): Promise<ShopifyProduct[]> {
  return listProducts({ limit, query });
}

async function findProductById(productId: string, limit: number, query?: string): Promise<ShopifyProduct> {
  const products = await listProducts({ limit, query });
  const product = products.find((item) => String(item.id) === productId);
  if (!product) throw new Error(`Product not found in current review list: ${productId}`);
  return product;
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function updateJob(job: GenerationJob, patch: Partial<GenerationJob>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function appendJobMessage(job: GenerationJob, message: string): void {
  job.messages = [...job.messages.slice(-80), message];
  updateJob(job, {});
}

function createGenerationJob(input: {
  products: ShopifyProduct[];
  productIds: string[];
  concurrency: number;
  budget: boolean;
  force: boolean;
}): GenerationJob {
  const now = new Date().toISOString();
  const job: GenerationJob = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: "queued",
    productIds: input.productIds,
    concurrency: input.concurrency,
    budget: input.budget,
    force: input.force,
    completed: 0,
    total: input.products.length,
    currentProduct: null,
    messages: [],
    error: null,
    createdAt: now,
    updatedAt: now
  };

  jobs.set(job.id, job);

  void runGenerationJob(job, input.products).catch((error) => {
    updateJob(job, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return job;
}

async function runGenerationJob(job: GenerationJob, products: ShopifyProduct[]): Promise<void> {
  updateJob(job, { status: "running" });
  appendJobMessage(job, `Started generation for ${products.length} product(s).`);

  for (const product of products) {
    updateJob(job, { currentProduct: product.handle });
    appendJobMessage(job, `Exporting ${product.handle}.`);
    const manifestPath = await exportProductImages(product);
    appendJobMessage(job, `Generating ${product.handle}.`);
    await generateProductImages(product, {
      budget: job.budget,
      concurrency: job.concurrency,
      force: job.force
    });
    appendJobMessage(job, `Done ${product.handle}: ${manifestPath}`);
    updateJob(job, { completed: job.completed + 1 });
  }

  updateJob(job, { status: "completed", currentProduct: null });
  appendJobMessage(job, "Generation completed.");
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendStatic(response: http.ServerResponse, requestPath: string): boolean {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(staticDir, relativePath);
  const relativeToStatic = path.relative(staticDir, filePath);

  if (relativeToStatic.startsWith("..") || path.isAbsolute(relativeToStatic) || !fs.existsSync(filePath)) {
    return false;
  }

  response.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

function sendAppShell(response: http.ServerResponse): boolean {
  return sendStatic(response, "/");
}

function sendMissingBuild(response: http.ServerResponse): void {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Review UI</title></head>
      <body style="font-family: system-ui; margin: 40px;">
        <h1>Review UI build missing</h1>
        <p>Run <code>npm run build:review</code>, then restart <code>npm run review</code>.</p>
      </body>
    </html>`);
}

export async function startReviewServer(options: { port: number; limit: number; query?: string }): Promise<void> {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://localhost:${options.port}`);

      if (request.method === "GET" && url.pathname === "/api/products") {
        const products = await listReviewProducts(options.limit, options.query);
        const categories = Array.from(
          new Set(products.map((product) => product.productType).filter((item): item is string => Boolean(item)))
        ).sort((a, b) => a.localeCompare(b));
        const collections = Array.from(
          new Map(
            products
              .flatMap((product) => product.collections)
              .map((collection) => [collection.id, collection] as const)
          ).values()
        ).sort((a, b) => a.title.localeCompare(b.title));
        sendJson(response, 200, {
          products,
          filters: { categories, collections },
          totals: {
            products: products.length,
            currentImages: products.reduce((total, product) => total + product.currentImages.length, 0),
            generatedImages: products.reduce((total, product) => total + product.generatedImages.length, 0)
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/generate") {
        const body = await readJsonBody<{
          productIds?: string[];
          concurrency?: number;
          budget?: boolean;
          force?: boolean;
        }>(request);
        const productIds = Array.from(new Set(body.productIds ?? [])).filter(Boolean);
        if (!productIds.length) {
          sendJson(response, 400, { error: "Select at least one product." });
          return;
        }

        const rawProducts = await listRawProducts(options.limit, options.query);
        const selected = rawProducts.filter((product) => productIds.includes(String(product.id)));
        if (!selected.length) {
          sendJson(response, 400, { error: "No selected products were found in the current product list." });
          return;
        }

        const concurrency = Math.max(1, Math.min(Number(body.concurrency ?? config.generationConcurrency) || 1, 6));
        const job = createGenerationJob({
          products: selected,
          productIds,
          concurrency,
          budget: body.budget ?? true,
          force: body.force ?? false
        });
        sendJson(response, 202, { job });
        return;
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobs.get(decodeURIComponent(jobMatch[1]));
        if (!job) {
          sendJson(response, 404, { error: "Job not found." });
          return;
        }
        sendJson(response, 200, { job });
        return;
      }

      if (request.method === "GET" && url.pathname === "/local-image") {
        const localPath = url.searchParams.get("path") ?? "";
        const resolvedPath = path.resolve(localPath);
        if (!isInsideDownloadsDir(resolvedPath) || !fs.existsSync(resolvedPath)) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
        fs.createReadStream(resolvedPath).pipe(response);
        return;
      }

      const match = url.pathname.match(/^\/api\/products\/(.+)\/replace-images$/);
      if (request.method === "POST" && match) {
        const productId = decodeURIComponent(match[1]);
        const product = await findProductById(productId, options.limit, options.query);
        await replaceProductImagesWithGenerated(product);
        sendJson(response, 200, { message: `Replaced images for ${product.handle}.` });
        return;
      }

      if (request.method === "GET") {
        if (sendStatic(response, url.pathname)) return;
        if (!path.extname(url.pathname)) {
          if (sendAppShell(response)) return;
          if (url.pathname === "/" || url.pathname.startsWith("/products/")) {
            sendMissingBuild(response);
            return;
          }
        }
        if (url.pathname === "/") {
          sendMissingBuild(response);
          return;
        }
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  console.log(`Review UI: http://localhost:${options.port}`);
}
