export const BASE_IMAGE_TYPES = ["situation", "closeup", "texture"] as const;
export const BUDGET_IMAGE_TYPES = ["situation", "closeup", "texture", "oeillets"] as const;

export const FIXATION_ORDER = [
  "multi-fonction",
  "passe-tringle",
  "galon-fronceur-crochets-escargot",
  "oeillets",
  "plis-flamands-agrafes-flamandes"
] as const;

export const ALL_IMAGE_TYPES = [...BASE_IMAGE_TYPES, ...FIXATION_ORDER] as const;

export type ImageType = (typeof ALL_IMAGE_TYPES)[number];
export type FixationType = (typeof FIXATION_ORDER)[number];

export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  situation: "Situation / lifestyle",
  closeup: "Close-up",
  texture: "Texture",
  "multi-fonction": "Multi-fonction",
  "passe-tringle": "Passe-tringle",
  "galon-fronceur-crochets-escargot": "Galon fronceur + crochets escargot",
  oeillets: "Oeillets",
  "plis-flamands-agrafes-flamandes": "Plis flamands + agrafes flamandes"
};

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function detectFixations(product: {
  title?: string | null;
  handle?: string | null;
  tags?: unknown;
  options?: unknown;
  variants?: unknown;
  metafields?: unknown;
}): FixationType[] {
  const values: string[] = [];
  addValue(values, product.title);
  addValue(values, product.handle);
  addValue(values, product.tags);
  addValue(values, product.options);
  addValue(values, product.variants);
  addValue(values, product.metafields);
  const haystack = values.map(normalizeText).filter(Boolean).join(" | ");
  return FIXATION_ORDER.filter((fixation) => NORMALIZED_SYNONYMS[fixation].some((synonym) => haystack.includes(synonym)));
}

export function isImageType(value: string): value is ImageType {
  return (ALL_IMAGE_TYPES as readonly string[]).includes(value);
}

export function availableTypesForProduct(detectedFixations: string[]): ImageType[] {
  const detected = new Set(detectedFixations);
  return [...BASE_IMAGE_TYPES, ...FIXATION_ORDER.filter((fixation) => detected.has(fixation))];
}

export function renderPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}
