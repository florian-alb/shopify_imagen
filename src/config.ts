import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd();

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFromRoot(value: string | undefined, fallback: string): string {
  const raw = value && value.trim() ? value : fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

export const config = {
  rootDir,
  promptsDir: path.resolve(rootDir, "prompts"),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  openaiImageSize: process.env.OPENAI_IMAGE_SIZE ?? "1024x1024",
  openaiImageQuality: process.env.OPENAI_IMAGE_QUALITY ?? "medium",
  openaiImageOutputFormat: process.env.OPENAI_IMAGE_OUTPUT_FORMAT ?? "jpeg",
  shopifyShopDomain: process.env.SHOPIFY_SHOP_DOMAIN ?? "",
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID ?? "",
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-04",
  shopifyProductQuery: process.env.SHOPIFY_PRODUCT_QUERY ?? "status:active",
  outputDir: resolveFromRoot(process.env.OUTPUT_DIR, "./output"),
  downloadsDir: path.resolve(
    resolveFromRoot(process.env.OUTPUT_DIR, "./output"),
    "downloads",
  ),
  referencesDir: path.resolve(
    resolveFromRoot(process.env.OUTPUT_DIR, "./output"),
    "references",
  ),
  shopifyImagesDir: path.resolve(
    resolveFromRoot(process.env.OUTPUT_DIR, "./output"),
    "shopify-images",
  ),
  statePath: resolveFromRoot(process.env.STATE_PATH, "./state/state.json"),
  dryRun: boolFromEnv(process.env.DRY_RUN, true),
  budgetMode: boolFromEnv(process.env.BUDGET_MODE, false),
  generationConcurrency: intFromEnv(process.env.GENERATION_CONCURRENCY, 1),
  openaiImageRequestsPerMinute: intFromEnv(process.env.OPENAI_IMAGE_REQUESTS_PER_MINUTE, 5),
  reviewPort: intFromEnv(process.env.REVIEW_PORT, 8787),
  maxRetries: intFromEnv(process.env.MAX_RETRIES, 2),
  waitMin: intFromEnv(process.env.WAIT_MIN, 2000),
  waitMax: intFromEnv(process.env.WAIT_MAX, 6000),
};
