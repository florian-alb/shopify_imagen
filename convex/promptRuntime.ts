export const MIN_REFERENCE_IMAGE_COUNT = 1;
export const MAX_REFERENCE_IMAGE_COUNT = 4;

export type PromptRuntimeInput = {
  imageType: string;
  label?: string | null;
  useVibeAnalysis?: boolean;
  referenceImageCount?: number | null;
};

type PromptRuntimeDefaults = {
  useVibeAnalysis: boolean;
  referenceImageCount: number;
};

const fallbackRuntimeDefaults: PromptRuntimeDefaults = {
  useVibeAnalysis: true,
  referenceImageCount: 2,
};

const promptRuntimeDefaults = new Map<string, PromptRuntimeDefaults>([
  ["studio - side profile", { useVibeAnalysis: false, referenceImageCount: 1 }],
  [
    "studio - front 3/4 pair",
    { useVibeAnalysis: false, referenceImageCount: 1 },
  ],
  [
    "studio - detail close-up",
    { useVibeAnalysis: false, referenceImageCount: 1 },
  ],
  [
    "on-foot - top-down worn view",
    { useVibeAnalysis: true, referenceImageCount: 2 },
  ],
  [
    "lifestyle - worn editorial",
    { useVibeAnalysis: true, referenceImageCount: 2 },
  ],
]);

function normalizePromptName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function defaultsForPrompt(prompt: PromptRuntimeInput): PromptRuntimeDefaults {
  const imageType = normalizePromptName(prompt.imageType);
  const label = normalizePromptName(prompt.label);
  return (
    promptRuntimeDefaults.get(imageType) ??
    promptRuntimeDefaults.get(label) ??
    (imageType.startsWith("studio - ") || label.startsWith("studio - ")
      ? { useVibeAnalysis: false, referenceImageCount: 1 }
      : imageType.startsWith("on-foot - ") ||
          label.startsWith("on-foot - ") ||
          imageType.startsWith("lifestyle - ") ||
          label.startsWith("lifestyle - ")
        ? { useVibeAnalysis: true, referenceImageCount: 2 }
        : fallbackRuntimeDefaults)
  );
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
  const defaults = defaultsForPrompt(prompt);
  return {
    useVibeAnalysis: prompt.useVibeAnalysis ?? defaults.useVibeAnalysis,
    referenceImageCount:
      validateReferenceImageCount(prompt.referenceImageCount) ??
      defaults.referenceImageCount,
  };
}
