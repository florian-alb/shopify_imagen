import { v } from "convex/values";

export const BACKGROUND_REMOVAL_PROVIDER = "fal_ideogram" as const;
export const BACKGROUND_REMOVAL_COST_USD = 0.01;
export const DEFAULT_BACKGROUND_COLOR = "#ffffff";

export const backgroundModeValidator = v.union(
  v.literal("solid"),
  v.literal("transparent"),
);

export const backgroundRemovalProviderValidator = v.union(
  v.literal(BACKGROUND_REMOVAL_PROVIDER),
  v.null(),
);

export type BackgroundMode = "solid" | "transparent";
export type BackgroundRemovalProvider = typeof BACKGROUND_REMOVAL_PROVIDER;

export type BackgroundConfigInput = {
  removeBackground?: boolean | null;
  backgroundMode?: string | null;
  backgroundColor?: string | null;
  backgroundShadow?: boolean | null;
};

export type BackgroundConfig = {
  removeBackground: boolean;
  backgroundRemovalProvider: BackgroundRemovalProvider | null;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundShadow: boolean;
};

export const backgroundConfigArgValidators = {
  removeBackground: v.optional(v.boolean()),
  backgroundMode: v.optional(backgroundModeValidator),
  backgroundColor: v.optional(v.string()),
  backgroundShadow: v.optional(v.boolean()),
};

export function hasBackgroundConfigInput(input: BackgroundConfigInput) {
  return (
    input.removeBackground !== undefined ||
    input.backgroundMode !== undefined ||
    input.backgroundColor !== undefined ||
    input.backgroundShadow !== undefined
  );
}

export function normalizeBackgroundColor(value?: string | null) {
  const color = (value ?? DEFAULT_BACKGROUND_COLOR).trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  throw new Error("Background color must be a hex color like #ffffff.");
}

export function backgroundConfigFrom(input: BackgroundConfigInput = {}): BackgroundConfig {
  const removeBackground = input.removeBackground === true;
  const backgroundMode = input.backgroundMode === "transparent" ? "transparent" : "solid";

  return {
    removeBackground,
    backgroundRemovalProvider: removeBackground ? BACKGROUND_REMOVAL_PROVIDER : null,
    backgroundMode,
    backgroundColor: normalizeBackgroundColor(input.backgroundColor),
    backgroundShadow: input.backgroundShadow ?? true,
  };
}
