import type { Doc } from "@/lib/convex";

export const supportedVariables = [
  "{{PRODUCT_TITLE}}",
  "{{PRODUCT_HANDLE}}",
  "{{IMAGE_TYPE}}",
  "{{PROMPT_KIND}}",
  "{{TARGET_AUDIENCE}}",
  "{{TARGET_GENDER}}",
  "{{MODEL_REFERENCE_KEY}}",
  "{{CONTEXT_CONFIDENCE}}",
];

export const newPromptTabValue = "__new-template__";

export const modelReferenceKeys = [
  "adult_female",
  "adult_male",
  "adult_unisex",
  "child_female",
  "child_male",
  "child_unisex",
  "default",
];

export const promptKindOptions = [
  "product_only",
  "product_detail",
  "product_scene",
  "human_model",
];

export const promptKindBlankValue = "__no_prompt_kind";

export type BackgroundMode = "solid" | "transparent";

export type BackgroundDraft = {
  removeBackground: boolean;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundShadow: boolean;
};

export type PromptAiDraft = {
  useVibeAnalysis: boolean;
  referenceImageCount: number;
};

export type NewPromptDraft = {
  imageType: string;
  content: string;
  promptKind: string;
} & BackgroundDraft &
  PromptAiDraft;

export const defaultBackgroundDraft: BackgroundDraft = {
  removeBackground: false,
  backgroundMode: "solid",
  backgroundColor: "#ffffff",
  backgroundShadow: true,
};

export const defaultPromptAiDraft: PromptAiDraft = {
  useVibeAnalysis: true,
  referenceImageCount: 1,
};

export function normalizePromptName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

export function defaultAiDraftForPromptName(imageType: string, label?: string | null): PromptAiDraft {
  const names = [normalizePromptName(imageType), normalizePromptName(label)];

  if (names.some((name) => name.startsWith("studio - "))) {
    return { useVibeAnalysis: false, referenceImageCount: 1 };
  }

  if (names.some((name) => name.startsWith("on-foot - "))) {
    return { useVibeAnalysis: true, referenceImageCount: 1 };
  }

  if (names.some((name) => name.startsWith("lifestyle - "))) {
    return { useVibeAnalysis: true, referenceImageCount: 1 };
  }

  return defaultPromptAiDraft;
}

export function normalizeReferenceImageCount(value: number) {
  if (!Number.isFinite(value)) return 1;

  return Math.min(4, Math.max(1, Math.round(value)));
}

export function modelReferenceBusyValue(key: string) {
  return `model-reference:${key}`;
}

export function promptAiDraft(prompt: Doc<"promptTemplates">): PromptAiDraft {
  const defaults = defaultAiDraftForPromptName(prompt.imageType, prompt.label);

  return {
    useVibeAnalysis: prompt.useVibeAnalysis ?? defaults.useVibeAnalysis,
    referenceImageCount: normalizeReferenceImageCount(prompt.referenceImageCount ?? defaults.referenceImageCount),
  };
}

export function promptBackgroundDraft(prompt: Doc<"promptTemplates">): BackgroundDraft {
  return {
    removeBackground: prompt.removeBackground === true,
    backgroundMode: prompt.backgroundMode === "transparent" ? "transparent" : "solid",
    backgroundColor: prompt.backgroundColor ?? defaultBackgroundDraft.backgroundColor,
    backgroundShadow: prompt.backgroundShadow ?? defaultBackgroundDraft.backgroundShadow,
  };
}

export function backgroundDraftsEqual(left: BackgroundDraft, right: BackgroundDraft) {
  return (
    left.removeBackground === right.removeBackground &&
    left.backgroundMode === right.backgroundMode &&
    left.backgroundColor.toLowerCase() === right.backgroundColor.toLowerCase() &&
    left.backgroundShadow === right.backgroundShadow
  );
}

export function promptAiDraftsEqual(left: PromptAiDraft, right: PromptAiDraft) {
  return (
    left.useVibeAnalysis === right.useVibeAnalysis &&
    left.referenceImageCount === right.referenceImageCount
  );
}

export function compilePromptPreview(masterPrompt: string, templatePrompt: string) {
  const master = masterPrompt.trim();
  const template = templatePrompt.trim();

  if (!master) return template;
  if (!template) return master;
  if (template.startsWith(master)) return template;

  return `${master}\n\n${template}`;
}
