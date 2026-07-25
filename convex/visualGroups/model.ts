export type SelectedOption = {
  name: string;
  value: string;
};

export type ShopifyVariantLike = {
  id: string;
  title?: string | null;
  selectedOptions?: SelectedOption[] | null;
  media?: {
    nodes?: Array<{ id?: string | null } | null> | null;
  } | null;
};

export type ShopifyOptionLike = {
  name: string;
  values?: string[] | null;
};

export type VisualGroupDraft = {
  key: string;
  label: string;
  optionValues: SelectedOption[];
  swatchCss: string | null;
  variantIds: string[];
};

export type ShopifyImageLike = {
  mediaId?: string | null;
  id?: string | null;
  altText?: string | null;
  variantIds?: string[] | null;
};

export type PositionedVisualReference = {
  position: number;
  groupPosition?: number;
};

export function visualReferencePosition(
  reference: PositionedVisualReference,
) {
  return reference.groupPosition ?? reference.position;
}

export function nextVisualReferencePosition(
  references: PositionedVisualReference[],
) {
  return references.reduce(
    (next, reference) =>
      Math.max(next, visualReferencePosition(reference) + 1),
    0,
  );
}

const colorOptionNames = new Set([
  "color",
  "colour",
  "couleur",
  "farbe",
  "colore",
  "cor",
]);

const colorValues: Array<[string[], string]> = [
  [["blanc", "white"], "#f7f7f5"],
  [["noir", "black"], "#1f2020"],
  [["rouge", "red"], "#c83f3a"],
  [["bordeaux", "burgundy", "wine"], "#6f2633"],
  [["bleu marine", "marine", "navy"], "#243b62"],
  [["bleu ciel", "sky blue"], "#7eb9df"],
  [["bleu", "blue"], "#3d6fc4"],
  [["vert olive", "olive"], "#6f7640"],
  [["vert", "green"], "#4e865f"],
  [["jaune", "yellow"], "#d7b63b"],
  [["orange"], "#d56a2f"],
  [["violet", "purple"], "#7755a7"],
  [["rose", "pink"], "#d8859d"],
  [["marron", "brown", "chocolat", "chocolate"], "#76513e"],
  [["beige", "sable", "sand"], "#cbb994"],
  [["gris", "gray", "grey"], "#777b7d"],
  [["or", "gold"], "#b79542"],
  [["argent", "silver"], "#a7adb2"],
  [["multicolore", "multicolor", "multi"], "conic-gradient(#c83f3a, #d7b63b, #4e865f, #3d6fc4, #c83f3a)"],
];

export function normalizeVisualText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function defaultVisualOptionNames(options: ShopifyOptionLike[]) {
  const color = options.find((option) =>
    colorOptionNames.has(normalizeVisualText(option.name)),
  );
  if (color) return [color.name];

  const meaningful = options.find(
    (option) =>
      normalizeVisualText(option.name) !== "title" &&
      !(option.values?.length === 1 && option.values[0] === "Default Title"),
  );
  return meaningful ? [meaningful.name] : [];
}

export function inferSwatchCss(optionValues: SelectedOption[]) {
  const colorValue = optionValues.find((option) =>
    colorOptionNames.has(normalizeVisualText(option.name)),
  )?.value;
  if (!colorValue) return null;

  const normalized = normalizeVisualText(colorValue);
  for (const [aliases, swatch] of colorValues) {
    if (
      aliases.some((alias) => {
        const normalizedAlias = normalizeVisualText(alias);
        return (
          normalized === normalizedAlias ||
          normalized.includes(normalizedAlias)
        );
      })
    ) {
      return swatch;
    }
  }
  return null;
}

function canonicalOptionNames(
  options: ShopifyOptionLike[],
  requestedNames: string[],
) {
  const byNormalizedName = new Map(
    options.map((option) => [normalizeVisualText(option.name), option.name]),
  );
  const names = Array.from(
    new Set(
      requestedNames
        .map((name) => byNormalizedName.get(normalizeVisualText(name)))
        .filter((name): name is string => Boolean(name)),
    ),
  );
  if (!names.length) {
    throw new Error("Select at least one Shopify option to create visual groups.");
  }
  return names;
}

function groupKey(optionValues: SelectedOption[]) {
  return optionValues
    .map(
      (option) =>
        `${encodeURIComponent(option.name)}=${encodeURIComponent(option.value)}`,
    )
    .join("&");
}

export function buildVisualGroupDrafts(args: {
  options: ShopifyOptionLike[];
  variants: ShopifyVariantLike[];
  optionNames: string[];
}): VisualGroupDraft[] {
  const optionNames = canonicalOptionNames(args.options, args.optionNames);
  const optionNameSet = new Set(optionNames);
  const groups = new Map<string, VisualGroupDraft>();

  for (const variant of args.variants) {
    const selectedOptions = variant.selectedOptions ?? [];
    const selectedByName = new Map(
      selectedOptions.map((option) => [option.name, option.value]),
    );
    const optionValues = optionNames
      .map((name) => {
        const value = selectedByName.get(name);
        return value ? { name, value } : null;
      })
      .filter((option): option is SelectedOption => Boolean(option));
    if (optionValues.length !== optionNameSet.size) continue;

    const key = groupKey(optionValues);
    const existing = groups.get(key);
    if (existing) {
      existing.variantIds.push(variant.id);
      continue;
    }

    groups.set(key, {
      key,
      label: optionValues.map((option) => option.value).join(" · "),
      optionValues,
      swatchCss: inferSwatchCss(optionValues),
      variantIds: [variant.id],
    });
  }

  return Array.from(groups.values());
}

export function variantMediaIds(variant: ShopifyVariantLike) {
  return (variant.media?.nodes ?? [])
    .map((media) => media?.id)
    .filter((id): id is string => Boolean(id));
}

export function inferReferenceAssignment(args: {
  image: ShopifyImageLike;
  groups: VisualGroupDraft[];
}) {
  const imageVariantIds = new Set(args.image.variantIds ?? []);
  if (imageVariantIds.size) {
    const matches = args.groups.filter((group) =>
      group.variantIds.some((variantId) => imageVariantIds.has(variantId)),
    );
    if (matches.length === 1) {
      return {
        groupKey: matches[0].key,
        source: "shopify" as const,
        confidence: 1,
        confirmed: true,
      };
    }
  }

  const alt = normalizeVisualText(args.image.altText ?? "");
  if (alt) {
    const matches = args.groups.filter((group) =>
      group.optionValues.every((option) => {
        const value = normalizeVisualText(option.value);
        return value.length > 1 && alt.includes(value);
      }),
    );
    if (matches.length === 1) {
      return {
        groupKey: matches[0].key,
        source: "rule" as const,
        confidence: 0.94,
        confirmed: true,
      };
    }
  }

  return {
    groupKey: null,
    source: "rule" as const,
    confidence: 0,
    confirmed: false,
  };
}
