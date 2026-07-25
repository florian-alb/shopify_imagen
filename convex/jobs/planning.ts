import type { Doc, Id } from "../_generated/dataModel";
import { backgroundConfigFrom, type BackgroundConfig } from "../background";
import { compilePrompt, renderPrompt } from "../lib";
import {
  inferProductVisualContext,
  resolveModelReference,
  visualContextPromptVariables,
} from "../productVisualContext";
import {
  resolvePromptRuntime,
  type PromptKind,
} from "../promptRuntime";
import type {
  ModelReferenceKey,
  StoredModelReference,
} from "../prompts/access";

export type PlannedImageTask = {
  product: Doc<"products">;
  visualGroupId: Id<"visualGroups"> | null;
  visualGroupKey: string | null;
  visualGroupLabel: string | null;
  imageType: string;
  promptUsed: string;
  promptKind: PromptKind;
  modelReferenceKey: ModelReferenceKey | null;
  modelReferenceStorageId: Id<"_storage"> | null;
  modelReferenceUrl: string | null;
  useVibeAnalysis: boolean;
  referenceImageCount: number;
  sourceImageUrls: string[];
  sourceImageUrl: string | null;
  sourceImageUrl2: string | null;
  background: BackgroundConfig;
};

export type VisualGroupTaskTarget = {
  productId: Id<"products">;
  groupId: Id<"visualGroups">;
  key: string;
  label: string;
  optionValues: Array<{ name: string; value: string }>;
  referenceUrls: string[];
};

export function buildImageTasks(args: {
  products: Doc<"products">[];
  prompts: Doc<"promptTemplates">[];
  promptSettings: Doc<"promptSettings"> | null;
  modelReferences?: Partial<Record<ModelReferenceKey, StoredModelReference>>;
  selectedImageTypes: string[];
  regenerationInstructions?: string;
  visualTargets?: VisualGroupTaskTarget[];
}) {
  const masterPrompt = args.promptSettings?.masterPrompt ?? "";
  const promptByType = new Map(
    args.prompts
      .filter((prompt) => prompt.isActive)
      .map((prompt) => [prompt.imageType, prompt]),
  );
  const selectedImageTypes = Array.from(
    new Set(args.selectedImageTypes),
  ).filter((type) => promptByType.has(type));
  if (!selectedImageTypes.length) {
    throw new Error("None selected image types active prompt template.");
  }

  const planned: PlannedImageTask[] = [];
  for (const product of args.products) {
    const visualContext = inferProductVisualContext(product);
    const productVisualTargets = args.visualTargets?.filter(
      (target) => target.productId === product._id,
    );
    const targets = productVisualTargets?.length
      ? productVisualTargets
      : [
          {
            productId: product._id,
            groupId: null,
            key: null,
            label: null,
            optionValues: [],
            referenceUrls: referenceImageUrls(product),
          },
        ];

    for (const target of targets) {
      for (const imageType of selectedImageTypes) {
        const template = promptByType.get(imageType);
        if (!template) {
          throw new Error(`No active prompt template found for ${imageType}.`);
        }
        const runtime = resolvePromptRuntime(template);
        const modelReference = resolveModelReference(
          args.modelReferences,
          visualContext,
          runtime.promptKind,
        );
        const compiledPrompt = compilePrompt(masterPrompt, template.content);
        const promptUsed = appendRegenerationInstructions(
          appendVisualGroupContract(
            renderPrompt(compiledPrompt, {
              PRODUCT_TITLE: product.title,
              PRODUCT_HANDLE: product.handle,
              IMAGE_TYPE: imageType,
              VISUAL_GROUP_LABEL: target.label ?? "",
              VISUAL_GROUP_VALUES: target.optionValues
                .map((option) => `${option.name}: ${option.value}`)
                .join(", "),
              ...visualContextPromptVariables(
                visualContext,
                runtime.promptKind,
              ),
            }),
            target,
          ),
          args.regenerationInstructions,
        );
        const references = target.referenceUrls.slice(
          0,
          runtime.referenceImageCount,
        );
        planned.push({
          product,
          visualGroupId: target.groupId,
          visualGroupKey: target.key,
          visualGroupLabel: target.label,
          imageType,
          promptUsed,
          promptKind: runtime.promptKind,
          modelReferenceKey: modelReference?.key ?? null,
          modelReferenceStorageId: modelReference?.storageId ?? null,
          modelReferenceUrl: null,
          useVibeAnalysis: runtime.useVibeAnalysis,
          referenceImageCount: runtime.referenceImageCount,
          sourceImageUrls: references,
          sourceImageUrl: references[0] ?? null,
          sourceImageUrl2: references[1] ?? null,
          background: backgroundConfigFrom(template),
        });
      }
    }
  }
  if (!planned.length) {
    throw new Error("No image tasks could be planned for selected products.");
  }
  return { planned, selectedImageTypes };
}

function appendVisualGroupContract(
  prompt: string,
  target: {
    label: string | null;
    optionValues: Array<{ name: string; value: string }>;
  },
) {
  if (!target.label) return prompt;
  const values = target.optionValues
    .map((option) => `${option.name}: ${option.value}`)
    .join(", ");
  return `${prompt}

VISUAL VARIANT CONTRACT:
Generate only the "${target.label}" product variant (${values}). Preserve its exact visible color, material, pattern, hardware, and construction from the confirmed reference images. Never borrow visual attributes from another variant.`;
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
