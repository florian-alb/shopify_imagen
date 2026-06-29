import type { Doc } from "../_generated/dataModel";
import { backgroundConfigFrom, type BackgroundConfig } from "../background";
import { compilePrompt, renderPrompt } from "../lib";
import { defaultMasterPrompt } from "../promptDefaults";
import { resolvePromptRuntime } from "../promptRuntime";

export type PlannedImageTask = {
  product: Doc<"products">;
  imageType: string;
  promptUsed: string;
  useVibeAnalysis: boolean;
  referenceImageCount: number;
  sourceImageUrls: string[];
  sourceImageUrl: string | null;
  sourceImageUrl2: string | null;
  background: BackgroundConfig;
};

export function buildImageTasks(args: {
  products: Doc<"products">[];
  prompts: Doc<"promptTemplates">[];
  promptSettings: Doc<"promptSettings"> | null;
  selectedImageTypes: string[];
  regenerationInstructions?: string;
}) {
  const masterPrompt = args.promptSettings?.masterPrompt ?? defaultMasterPrompt;
  const promptByType = new Map(
    args.prompts
      .filter((prompt) => prompt.isActive)
      .map((prompt) => [prompt.imageType, prompt]),
  );
  const selectedImageTypes = Array.from(
    new Set(args.selectedImageTypes),
  ).filter((type) => promptByType.has(type));
  if (!selectedImageTypes.length) {
    throw new Error(
      "None of the selected image types have an active prompt template.",
    );
  }

  const planned: PlannedImageTask[] = [];
  for (const product of args.products) {
    for (const imageType of selectedImageTypes) {
      const template = promptByType.get(imageType);
      if (!template) {
        throw new Error(`No active prompt template found for ${imageType}.`);
      }
      const runtime = resolvePromptRuntime(template);
      const compiledPrompt = compilePrompt(masterPrompt, template.content);
      const promptUsed = appendRegenerationInstructions(
        renderPrompt(compiledPrompt, {
          PRODUCT_TITLE: product.title,
          PRODUCT_HANDLE: product.handle,
          IMAGE_TYPE: imageType,
        }),
        args.regenerationInstructions,
      );
      const references = referenceImageUrls(product).slice(
        0,
        runtime.referenceImageCount,
      );

      planned.push({
        product,
        imageType,
        promptUsed,
        useVibeAnalysis: runtime.useVibeAnalysis,
        referenceImageCount: runtime.referenceImageCount,
        sourceImageUrls: references,
        sourceImageUrl: references[0] ?? null,
        sourceImageUrl2: references[1] ?? null,
        background: backgroundConfigFrom(template),
      });
    }
  }

  if (!planned.length) {
    throw new Error(
      "No image tasks could be planned for the selected products.",
    );
  }

  return { planned, selectedImageTypes };
}

function appendRegenerationInstructions(prompt: string, instructions?: string) {
  const correction = instructions?.trim();
  if (!correction) return prompt;
  return `${prompt}

IMPORTANT CORRECTION FOR THIS REGENERATION:
${correction}

Apply this correction with priority while preserving all other product details from the reference image and the instructions above.`;
}

function referenceImageUrls(product: Doc<"products">): string[] {
  const candidates = [
    product.featuredImageUrl,
    ...product.currentShopifyImages.map(
      (image) => (image as { url?: string } | null)?.url,
    ),
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  return Array.from(new Set(candidates));
}
