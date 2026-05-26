import type { FixationType, ImageType } from "./imageTypes";
import { BASE_IMAGE_TYPES, BUDGET_IMAGE_TYPES, FIXATION_ORDER } from "./imageTypes";
import { normalizeText } from "./normalize";

export type ProductLikeForFixations = {
  title?: string | null;
  handle?: string | null;
  tags?: string[] | string | null;
  options?: Array<{ name?: string | null; values?: Array<string | null> | null }> | null;
  variants?: Array<{
    title?: string | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  }> | null;
  metafields?: Array<{ namespace?: string | null; key?: string | null; value?: unknown }> | Record<string, unknown> | null;
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

const NORMALIZED_SYNONYMS = Object.fromEntries(
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

export function collectProductSearchText(product: ProductLikeForFixations): string[] {
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

  addValue(values, product.metafields);
  return values.map(normalizeText).filter(Boolean);
}

export function getAvailableFixations(product: ProductLikeForFixations): FixationType[] {
  const haystack = collectProductSearchText(product).join(" | ");
  return FIXATION_ORDER.filter((fixation) => {
    return NORMALIZED_SYNONYMS[fixation].some((synonym) => haystack.includes(synonym));
  });
}

export function getAvailableImageTypes(detectedFixations: string[] = []): ImageType[] {
  const fixationSet = new Set(detectedFixations);
  return [...BASE_IMAGE_TYPES, ...FIXATION_ORDER.filter((fixation) => fixationSet.has(fixation))];
}

export function getBudgetImageTypes(detectedFixations: string[] = []): ImageType[] {
  const available = getAvailableImageTypes(detectedFixations);
  const budgetSet = new Set(BUDGET_IMAGE_TYPES);
  return available.filter((imageType) => budgetSet.has(imageType));
}

export function getBulkAvailableImageTypes(products: Array<{ detectedFixations?: string[] }>): ImageType[] {
  const fixations = new Set<string>();
  products.forEach((product) => {
    product.detectedFixations?.forEach((fixation) => fixations.add(fixation));
  });
  return getAvailableImageTypes(Array.from(fixations));
}
