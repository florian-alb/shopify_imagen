import { ensureRuntimeFolders } from "./storage/files.js";
import { config } from "./config.js";
import { hasShopifyCredentials, listProducts } from "./shopify/adminApi.js";
import { mockProduct } from "./shopify/mockProduct.js";
import { dryRunProduct, printDryRunResult } from "./workflows/dryRunProduct.js";
import { generateProductImages } from "./workflows/generateProductImages.js";
import { exportProductImages } from "./workflows/exportProductImages.js";
import { replaceProductImagesWithGenerated } from "./workflows/attachGeneratedImages.js";
import { startReviewServer } from "./server/reviewServer.js";
import type { ShopifyProduct } from "./types.js";

type Command = "dry-run" | "export-images" | "generate" | "attach-images" | "review" | "full";

function getArgValue(argv: string[], name: string): string | undefined {
  return argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function parseArgs(argv: string[]): {
  command: Command;
  limit: number;
  query?: string;
  budget: boolean;
  concurrency: number;
  force: boolean;
} {
  const command = (argv[2] ?? "dry-run") as Command;
  if (!["dry-run", "export-images", "generate", "attach-images", "review", "full"].includes(command)) {
    throw new Error(
      `Unknown command "${command}". Use dry-run, export-images, generate, attach-images, review, or full.`,
    );
  }

  const limitArg = getArgValue(argv, "limit");
  const defaultLimit = command === "review" ? 50 : 1;
  const limit = limitArg ? Number.parseInt(limitArg, 10) : defaultLimit;

  const concurrencyArg = getArgValue(argv, "concurrency");
  const concurrency = concurrencyArg ? Number.parseInt(concurrencyArg, 10) : config.generationConcurrency;

  return {
    command,
    limit: Number.isFinite(limit) && limit > 0 ? limit : defaultLimit,
    query: getArgValue(argv, "query"),
    budget: argv.includes("--budget") || config.budgetMode,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : config.generationConcurrency,
    force: argv.includes("--force"),
  };
}

async function getProducts(
  command: Command,
  limit: number,
  query?: string,
): Promise<ShopifyProduct[]> {
  if (command === "dry-run" && !hasShopifyCredentials()) {
    return [mockProduct].slice(0, limit);
  }

  return listProducts({ limit, query });
}

async function main(): Promise<void> {
  ensureRuntimeFolders();
  const { command, limit, query, budget, concurrency, force } = parseArgs(process.argv);

  if (command === "review") {
    await startReviewServer({ port: config.reviewPort, limit, query });
    return;
  }

  const products = await getProducts(command, limit, query);

  if (command === "dry-run") {
    for (const product of products) {
      printDryRunResult(dryRunProduct(product, { budget }));
    }
    return;
  }

  if (command === "generate") {
    for (const product of products) await generateProductImages(product, { budget, concurrency, force });
    return;
  }

  if (command === "export-images") {
    for (const product of products) {
      const manifestPath = await exportProductImages(product);
      console.log(`Exported ${product.handle} images: ${manifestPath}`);
    }
    return;
  }

  if (command === "attach-images") {
    for (const product of products) await replaceProductImagesWithGenerated(product);
    return;
  }

  for (const product of products) {
    const manifestPath = await exportProductImages(product);
    console.log(`Exported ${product.handle} images: ${manifestPath}`);
    await generateProductImages(product, { budget, concurrency, force });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
