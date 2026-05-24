import { normalizeText } from "../utils/normalize.js";
import type { FixationType, ImageType, ShopifyMetafield, ShopifyProduct } from "../types.js";

export const BASE_IMAGE_TYPES = ["situation", "closeup", "texture"] as const;
export const BUDGET_IMAGE_TYPES = ["situation", "closeup", "texture", "oeillets"] as const;

export const FIXATION_ORDER: FixationType[] = [
  "multi-fonction",
  "passe-tringle",
  "galon-fronceur-crochets-escargot",
  "oeillets",
  "plis-flamands-agrafes-flamandes"
];

export const IMAGE_TYPE_NUMBERS: Record<ImageType, string> = {
  situation: "01",
  closeup: "02",
  texture: "03",
  "multi-fonction": "04",
  "passe-tringle": "05",
  "galon-fronceur-crochets-escargot": "06",
  oeillets: "07",
  "plis-flamands-agrafes-flamandes": "08"
};

const FIXATION_SYNONYMS: Record<FixationType, string[]> = {
  "multi-fonction": ["multi-fonction", "multifonction", "multi fonction", "multi function", "multifunction"],
  "passe-tringle": ["passe-tringle", "passe tringle", "rod pocket", "pole pocket"],
  "galon-fronceur-crochets-escargot": [
    "galon fronceur",
    "crochets escargot",
    "escargot",
    "gathering tape",
    "heading tape",
    "snail hooks"
  ],
  oeillets: ["oeillets", "œillets", "oeillet", "eyelets", "grommets"],
  "plis-flamands-agrafes-flamandes": [
    "plis flamands",
    "pli flamand",
    "agrafes flamandes",
    "flemish pleats",
    "flemish hooks",
    "pinch pleats"
  ]
};

const NORMALIZED_SYNONYMS: Record<FixationType, string[]> = Object.fromEntries(
  Object.entries(FIXATION_SYNONYMS).map(([fixation, synonyms]) => [
    fixation,
    synonyms.map((synonym) => normalizeText(synonym))
  ])
) as Record<FixationType, string[]>;

function addValue(values: string[], value: unknown): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => addValue(values, item));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => addValue(values, item));
    return;
  }
  values.push(String(value));
}

function collectMetafieldValues(values: string[], metafields: ShopifyProduct["metafields"]): void {
  if (!metafields) return;

  if (Array.isArray(metafields)) {
    metafields.forEach((metafield: ShopifyMetafield) => {
      addValue(values, metafield.namespace);
      addValue(values, metafield.key);
      addValue(values, metafield.value);
    });
    return;
  }

  addValue(values, metafields);
}

export function collectProductSearchText(product: ShopifyProduct): string[] {
  const values: string[] = [];

  addValue(values, product.title);
  addValue(values, product.handle);
  addValue(values, product.tags);

  product.options?.forEach((option) => {
    addValue(values, option.name);
    addValue(values, option.values);
  });

  product.variants?.forEach((variant) => {
    addValue(values, variant.title);
    addValue(values, variant.option1);
    addValue(values, variant.option2);
    addValue(values, variant.option3);
    variant.selectedOptions?.forEach((option) => {
      addValue(values, option.name);
      addValue(values, option.value);
    });
  });

  collectMetafieldValues(values, product.metafields);
  return values.map(normalizeText).filter(Boolean);
}

export function getAvailableFixations(product: ShopifyProduct): FixationType[] {
  const haystack = collectProductSearchText(product).join(" | ");

  return FIXATION_ORDER.filter((fixation) => {
    return NORMALIZED_SYNONYMS[fixation].some((synonym) => haystack.includes(synonym));
  });
}

export function getRequiredImageTypes(product: ShopifyProduct, options: { budget?: boolean } = {}): ImageType[] {
  const requested = Array.from(new Set<ImageType>([...BASE_IMAGE_TYPES, ...getAvailableFixations(product)]));
  if (!options.budget) return requested;

  const budgetSet = new Set<ImageType>(BUDGET_IMAGE_TYPES);
  return requested.filter((imageType) => budgetSet.has(imageType));
}
