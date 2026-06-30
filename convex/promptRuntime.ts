export const MIN_REFERENCE_IMAGE_COUNT = 1;
export const MAX_REFERENCE_IMAGE_COUNT = 4;

export const promptKinds = [
  "product_only",
  "product_detail",
  "product_scene",
  "human_model",
] as const;

export type PromptKind = (typeof promptKinds)[number];

const legacyPromptKindAliases: Record<string, PromptKind> = {
  studio_product: "product_only",
  detail_product: "product_detail",
  worn_model: "human_model",
  lifestyle_model: "product_scene",
};

export type PromptRuntimeInput = {
  imageType: string;
  label?: string | null;
  promptKind?: string | null;
  useVibeAnalysis?: boolean;
  referenceImageCount?: number | null;
};

type PromptRuntimeDefaults = {
  useVibeAnalysis: boolean;
  referenceImageCount: number;
};

const runtimeByKind: Record<PromptKind, PromptRuntimeDefaults> = {
  product_only: { useVibeAnalysis: false, referenceImageCount: 1 },
  product_detail: { useVibeAnalysis: false, referenceImageCount: 1 },
  product_scene: { useVibeAnalysis: true, referenceImageCount: 1 },
  human_model: { useVibeAnalysis: true, referenceImageCount: 1 },
};

function normalizePromptName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

export function isPromptKind(value: unknown): value is PromptKind {
  return typeof value === "string" && promptKinds.includes(value as PromptKind);
}

export function normalizePromptKind(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (isPromptKind(normalized)) return normalized;
  return legacyPromptKindAliases[normalized];
}

export function resolvePromptKind(prompt: {
  imageType: string;
  label?: string | null;
  promptKind?: string | null;
}): PromptKind {
  const explicitKind = normalizePromptKind(prompt.promptKind);
  if (explicitKind) return explicitKind;

  const names = [
    normalizePromptName(prompt.imageType),
    normalizePromptName(prompt.label),
  ];

  if (
    names.some(
      (name) =>
        name.startsWith("on-foot - ") ||
        name.includes("on foot") ||
        name.includes("worn view") ||
        name.includes("worn model") ||
        name.includes("human model") ||
        name.includes("mannequin"),
    )
  ) {
    return "human_model";
  }

  if (
    names.some(
      (name) =>
        name.startsWith("product detail") ||
        name.startsWith("studio - detail") ||
        name.includes("detail close") ||
        name.includes("close-up") ||
        name.includes("closeup"),
    )
  ) {
    return "product_detail";
  }

  if (
    names.some(
      (name) =>
        name.startsWith("product scene") ||
        name.startsWith("lifestyle - ") ||
        name.includes("lifestyle") ||
        name.includes("in use") ||
        name.includes("in-use"),
    )
  ) {
    return "product_scene";
  }

  if (
    names.some(
      (name) =>
        name.startsWith("product only") ||
        name.startsWith("studio - ") ||
        name.includes("packshot"),
    )
  ) {
    return "product_only";
  }

  return "product_only";
}

export function isHumanModelPromptKind(
  promptKind: string | null | undefined,
) {
  return normalizePromptKind(promptKind) === "human_model";
}

export function validatePromptKind(value: string | null | undefined) {
  if (value == null || value.trim() === "") return undefined;
  const promptKind = normalizePromptKind(value);
  if (!promptKind) {
    throw new Error(`Unsupported prompt kind "${value}".`);
  }
  return promptKind;
}

export function validateReferenceImageCount(value: number | null | undefined) {
  if (value == null) return undefined;
  if (
    !Number.isInteger(value) ||
    value < MIN_REFERENCE_IMAGE_COUNT ||
    value > MAX_REFERENCE_IMAGE_COUNT
  ) {
    throw new Error(
      `Reference image count must be between ${MIN_REFERENCE_IMAGE_COUNT} and ${MAX_REFERENCE_IMAGE_COUNT}.`,
    );
  }
  return value;
}

export function resolvePromptRuntime(prompt: PromptRuntimeInput) {
  const promptKind = resolvePromptKind(prompt);
  const defaults = runtimeByKind[promptKind];
  return {
    promptKind,
    useVibeAnalysis: prompt.useVibeAnalysis ?? defaults.useVibeAnalysis,
    referenceImageCount:
      validateReferenceImageCount(prompt.referenceImageCount) ??
      defaults.referenceImageCount,
  };
}
