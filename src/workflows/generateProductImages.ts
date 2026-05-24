import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { generateImageWithOpenAi } from "../openai/imageGenerator.js";
import { getRequiredImageTypes } from "../prompts/fixationDetector.js";
import { loadPrompt, renderPrompt } from "../prompts/promptLoader.js";
import { downloadSupplierReferenceImage } from "../shopify/referenceImage.js";
import { getLegacyOutputPath, getOutputPath } from "../storage/files.js";
import { readState, upsertProductState } from "../storage/state.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import type { ImageType, ShopifyProduct } from "../types.js";

function moveExistingGeneratedImage(existingPath: string, outputPath: string): string {
  if (path.resolve(existingPath) === path.resolve(outputPath)) return outputPath;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.renameSync(existingPath, outputPath);
  return outputPath;
}

type GenerationTask = {
  imageType: ImageType;
  outputPath: string;
  prompt: string;
};

export async function generateProductImages(
  product: ShopifyProduct,
  options: { budget?: boolean; concurrency?: number; force?: boolean } = {},
): Promise<void> {
  if (config.dryRun) {
    throw new Error("Generation is blocked while DRY_RUN=true.");
  }
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for API image generation.");
  }

  try {
    const imageTypes = getRequiredImageTypes(product, options);
    const referenceImagePath = await downloadSupplierReferenceImage(product);
    upsertProductState(product, { status: "generating", requestedImageTypes: imageTypes, error: null });

    const tasks: GenerationTask[] = [];
    const skipped: string[] = [];

    for (const imageType of imageTypes) {
      const state = readState()[String(product.id)];
      const existingPath = state?.generatedImages?.[imageType];
      const outputPath = getOutputPath(product, imageType);
      const legacyOutputPath = getLegacyOutputPath(product, imageType);

      if (!options.force && existingPath && fs.existsSync(existingPath)) {
        const organizedPath = moveExistingGeneratedImage(existingPath, outputPath);
        if (organizedPath !== existingPath) {
          upsertProductState(product, {
            generatedImages: {
              ...(state?.generatedImages ?? {}),
              [imageType]: organizedPath
            }
          });
        }
        skipped.push(imageType);
        continue;
      }

      if (!options.force && fs.existsSync(legacyOutputPath)) {
        const organizedPath = moveExistingGeneratedImage(legacyOutputPath, outputPath);
        upsertProductState(product, {
          generatedImages: {
            ...(state?.generatedImages ?? {}),
            [imageType]: organizedPath
          }
        });
        skipped.push(imageType);
        continue;
      }

      if (!options.force && fs.existsSync(outputPath)) {
        upsertProductState(product, {
          generatedImages: {
            ...(state?.generatedImages ?? {}),
            [imageType]: outputPath
          }
        });
        skipped.push(imageType);
        continue;
      }

      const prompt = renderPrompt(loadPrompt(imageType), {
        PRODUCT_TITLE: product.title,
        PRODUCT_HANDLE: product.handle,
        IMAGE_TYPE: imageType,
        FIXATION_TYPE: imageType
      });

      tasks.push({ imageType, outputPath, prompt });
    }

    if (skipped.length) {
      console.log(`Skipped ${product.handle}: ${skipped.length}/${imageTypes.length} already generated (${skipped.join(", ")}).`);
    }

    if (tasks.length) {
      const concurrency = options.concurrency ?? config.generationConcurrency;
      const mode = options.force ? "force regenerating" : "generating";
      console.log(`${mode} ${tasks.length} image(s) for ${product.handle} with concurrency=${concurrency}.`);
      await mapWithConcurrency(tasks, concurrency, async (task) => {
        console.log(`Generating ${product.handle} / ${task.imageType}...`);
        const generatedPath = await generateImageWithOpenAi({
          product,
          imageType: task.imageType,
          prompt: task.prompt,
          outputPath: task.outputPath,
          referenceImagePath
        });
        const latestState = readState()[String(product.id)];
        upsertProductState(product, {
          status: "generating",
          generatedImages: {
            ...(latestState?.generatedImages ?? {}),
            [task.imageType]: generatedPath
          }
        });
        console.log(`Generated ${product.handle} / ${task.imageType}: ${generatedPath}`);
      });
    } else {
      console.log(`No new images to generate for ${product.handle}. Use --force to regenerate existing files.`);
    }

    upsertProductState(product, { status: "generated" });
  } catch (error) {
    upsertProductState(product, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
