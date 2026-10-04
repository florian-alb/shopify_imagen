import type { Doc, Id } from "../_generated/dataModel";
import type { GenerationTarget, VariantSelection } from "../generationTargets";
import {
  evaluatePromptCondition,
  validateConditionalPrompt,
} from "../promptConditions";
import {
  selectImageTargets,
  type ImageTarget,
  type VisualGroupTaskTarget,
} from "./targets";
export type { VisualGroupTaskTarget } from "./targets";
import { backgroundConfigFrom, type BackgroundConfig } from "../background";
import { compilePrompt, renderPrompt } from "../lib";
import {
  inferProductVisualContext,
  resolveModelReference,
  visualContextPromptVariables,
} from "../productVisualContext";
import { resolvePromptRuntime, type PromptKind } from "../promptRuntime";
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
  generationTarget: GenerationTarget;
  promptBranch: "main" | "if_true" | "otherwise";
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

export function buildImageTasks(args: {
  products: Doc<"products">[];
  prompts: Doc<"promptTemplates">[];
  promptSettings: Doc<"promptSettings"> | null;
  modelReferences?: Partial<Record<ModelReferenceKey, StoredModelReference>>;
  selectedImageTypes: string[];
  regenerationInstructions?: string;
  visualTargets?: VisualGroupTaskTarget[];
  variantSelection?: VariantSelection;
  separatedProductIds?: Id<"products">[];
  restoredTarget?: ImageTarget;
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
    const targets = args.restoredTarget
      ? [args.restoredTarget]
      : selectImageTargets({
          product,
          visualTargets: args.visualTargets,
          variantSelection: args.variantSelection,
          separated: args.separatedProductIds?.includes(product._id),
        });

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
        validateConditionalPrompt(
          template.condition,
          template.alternativeContent,
        );
        const promptBranch = template.condition
          ? evaluatePromptCondition(template.condition, target.generationTarget)
            ? "if_true"
            : "otherwise"
          : "main";
        const compiledPrompt = compilePrompt(
          masterPrompt,
          promptBranch === "otherwise"
            ? template.alternativeContent!
            : template.content,
        );
        const promptUsed = appendRegenerationInstructions(
          appendTargetContract(
            renderPrompt(
              compiledPrompt,
              {
                PRODUCT_TITLE: target.generationTarget.productTitle,
                PRODUCT_HANDLE: product.handle,
                IMAGE_TYPE: imageType,
                VARIANT_TITLE: target.generationTarget.variantTitle,
                VARIANT_OPTIONS: target.generationTarget.selectedOptions
                  .map((option) => `${option.name}: ${option.value}`)
                  .join(", "),
                VISUAL_GROUP_LABEL: target.label ?? "",
                VISUAL_GROUP_VALUES: target.optionValues
                  .map((option) => `${option.name}: ${option.value}`)
                  .join(", "),
                ...visualContextPromptVariables(
                  visualContext,
                  runtime.promptKind,
                ),
              },
              target.generationTarget.selectedOptions,
            ),
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
          generationTarget: target.generationTarget,
          promptBranch,
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

function appendTargetContract(prompt: string, target: ImageTarget) {
  if (target.generationTarget.kind === "variant") {
    const options = target.generationTarget.selectedOptions
      .map((option) => `${option.name}: ${option.value}`)
      .join(", ");
    prompt = `${prompt}\n\nGENERATION VARIANT:\nGenerate the product variant "${target.generationTarget.variantTitle}" (${options}). Match these selected option values; do not substitute another variant.`;
  }
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
