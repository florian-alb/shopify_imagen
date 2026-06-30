import type { Doc, Id } from "./_generated/dataModel";
import { normalizeText } from "./lib";
import { isHumanModelPromptKind, type PromptKind } from "./promptRuntime";
import type {
  ModelReferenceKey,
  StoredModelReference,
} from "./prompts/access";

export type TargetAudience =
  | "baby"
  | "toddler"
  | "child"
  | "teen"
  | "adult"
  | "unknown";

export type TargetGender = "female" | "male" | "unisex" | "unknown";

export type ProductVisualContext = {
  targetAudience: TargetAudience;
  targetGender: TargetGender;
  modelReferenceKey: ModelReferenceKey | null;
  confidence: number;
  signals: string[];
};

export type ResolvedModelReference = {
  key: ModelReferenceKey;
  storageId: Id<"_storage">;
};

type AudienceRule = {
  audience: Exclude<TargetAudience, "unknown">;
  phrases: string[];
};

type GenderRule = {
  gender: Exclude<TargetGender, "unknown">;
  phrases: string[];
};

const audienceRules: AudienceRule[] = [
  {
    audience: "baby",
    phrases: ["bebe", "baby", "newborn", "nouveau ne", "infant"],
  },
  {
    audience: "toddler",
    phrases: ["toddler", "tout petit", "premiers pas"],
  },
  {
    audience: "teen",
    phrases: ["ado", "adolescent", "adolescente", "teen", "teenager"],
  },
  {
    audience: "child",
    phrases: ["enfant", "enfants", "kid", "kids", "child", "children", "junior"],
  },
  {
    audience: "adult",
    phrases: ["adult", "adulte", "adults", "adultes"],
  },
];

const femaleRules: GenderRule[] = [
  { gender: "female", phrases: ["fille", "girl", "girls"] },
  { gender: "female", phrases: ["femme", "women", "woman", "dame"] },
];

const maleRules: GenderRule[] = [
  { gender: "male", phrases: ["garcon", "boy", "boys"] },
  { gender: "male", phrases: ["homme", "men", "man", "monsieur"] },
];

const unisexPhrases = ["unisex", "unisexe", "mixte"];

function tokensFor(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function metadataTokens(product: Doc<"products">) {
  const values = [
    product.title,
    product.handle,
    product.productType,
    product.vendor,
    ...product.tags,
    JSON.stringify(product.collections ?? []),
    JSON.stringify(product.options ?? []),
    JSON.stringify(product.variants ?? []),
    JSON.stringify(product.metafields ?? []),
  ];
  return tokensFor(values.filter(Boolean).join(" "));
}

function phraseTokens(phrase: string) {
  return tokensFor(phrase);
}

function findPhrase(tokens: string[], phrases: string[]) {
  for (const phrase of phrases) {
    const expected = phraseTokens(phrase);
    if (!expected.length || expected.length > tokens.length) continue;

    for (let index = 0; index <= tokens.length - expected.length; index += 1) {
      const matches = expected.every(
        (token, offset) => tokens[index + offset] === token,
      );
      if (matches) return expected.join(" ");
    }
  }
  return null;
}

function findAudience(tokens: string[]) {
  const signals: string[] = [];
  for (const rule of audienceRules) {
    const phrase = findPhrase(tokens, rule.phrases);
    if (phrase) {
      signals.push(`audience:${rule.audience}:${phrase}`);
      return { audience: rule.audience, signals };
    }
  }
  return { audience: "unknown" as const, signals };
}

function findGender(tokens: string[], audience: TargetAudience) {
  const femalePhrase = findPhrase(
    tokens,
    femaleRules.flatMap((rule) => rule.phrases),
  );
  const malePhrase = findPhrase(
    tokens,
    maleRules.flatMap((rule) => rule.phrases),
  );
  const unisexPhrase = findPhrase(tokens, unisexPhrases);
  const signals: string[] = [];

  if (femalePhrase && !malePhrase) {
    signals.push(`gender:female:${femalePhrase}`);
    return { gender: "female" as const, signals, explicit: true };
  }
  if (malePhrase && !femalePhrase) {
    signals.push(`gender:male:${malePhrase}`);
    return { gender: "male" as const, signals, explicit: true };
  }
  if (femalePhrase && malePhrase) {
    signals.push(`gender:unisex:conflict`);
    return { gender: "unisex" as const, signals, explicit: true };
  }
  if (unisexPhrase) {
    signals.push(`gender:unisex:${unisexPhrase}`);
    return { gender: "unisex" as const, signals, explicit: true };
  }
  if (audience !== "unknown") {
    signals.push("gender:unisex:implicit");
    return { gender: "unisex" as const, signals, explicit: false };
  }
  return { gender: "unknown" as const, signals, explicit: false };
}

function audienceImpliedByGender(
  audience: TargetAudience,
  genderSignals: string[],
) {
  if (audience !== "unknown") return audience;
  if (
    genderSignals.some(
      (signal) =>
        signal.includes(":femme") ||
        signal.includes(":women") ||
        signal.includes(":woman") ||
        signal.includes(":dame") ||
        signal.includes(":homme") ||
        signal.includes(":men") ||
        signal.includes(":man") ||
        signal.includes(":monsieur"),
    )
  ) {
    return "adult";
  }
  if (
    genderSignals.some(
      (signal) =>
        signal.includes(":fille") ||
        signal.includes(":girl") ||
        signal.includes(":girls") ||
        signal.includes(":garcon") ||
        signal.includes(":boy") ||
        signal.includes(":boys"),
    )
  ) {
    return "child";
  }
  return audience;
}

function audienceReferenceGroup(targetAudience: TargetAudience) {
  if (targetAudience === "adult") return "adult";
  if (
    targetAudience === "baby" ||
    targetAudience === "toddler" ||
    targetAudience === "child" ||
    targetAudience === "teen"
  ) {
    return "child";
  }
  return "unknown";
}

function referenceGender(targetGender: TargetGender) {
  return targetGender === "female" || targetGender === "male"
    ? targetGender
    : "unisex";
}

export function modelReferenceKeyForContext(
  context: Pick<ProductVisualContext, "targetAudience" | "targetGender">,
): ModelReferenceKey | null {
  const group = audienceReferenceGroup(context.targetAudience);
  if (group === "unknown") return "default";
  return `${group}_${referenceGender(context.targetGender)}` as ModelReferenceKey;
}

function confidenceFor(args: {
  targetAudience: TargetAudience;
  targetGender: TargetGender;
  explicitGender: boolean;
}) {
  if (args.targetAudience === "unknown" && args.targetGender === "unknown") {
    return 0;
  }
  let confidence = 0.25;
  if (args.targetAudience !== "unknown") confidence += 0.45;
  if (args.explicitGender) confidence += 0.25;
  if (args.targetGender === "unisex" && !args.explicitGender) confidence += 0.1;
  return Math.min(0.95, Number(confidence.toFixed(2)));
}

export function inferProductVisualContext(
  product: Doc<"products">,
): ProductVisualContext {
  const tokens = metadataTokens(product);
  const audienceMatch = findAudience(tokens);
  const initialGender = findGender(tokens, audienceMatch.audience);
  const targetAudience = audienceImpliedByGender(
    audienceMatch.audience,
    initialGender.signals,
  );
  const genderMatch =
    targetAudience === audienceMatch.audience
      ? initialGender
      : findGender(tokens, targetAudience);
  const context = {
    targetAudience,
    targetGender: genderMatch.gender,
    modelReferenceKey: null,
    confidence: confidenceFor({
      targetAudience,
      targetGender: genderMatch.gender,
      explicitGender: genderMatch.explicit,
    }),
    signals: [...audienceMatch.signals, ...genderMatch.signals],
  } satisfies ProductVisualContext;

  return {
    ...context,
    modelReferenceKey: modelReferenceKeyForContext(context),
  };
}

export function promptKindUsesHumanModel(promptKind: string | null | undefined) {
  return isHumanModelPromptKind(promptKind);
}

export function modelReferenceCandidates(
  context: ProductVisualContext,
): ModelReferenceKey[] {
  const group = audienceReferenceGroup(context.targetAudience);
  if (group === "unknown") return ["default"];

  const gender = referenceGender(context.targetGender);
  const exact = `${group}_${gender}` as ModelReferenceKey;
  if (gender === "unisex") return [exact];

  return [exact, `${group}_unisex` as ModelReferenceKey];
}

export function resolveModelReference(
  modelReferences:
    | Partial<Record<ModelReferenceKey, StoredModelReference>>
    | null
    | undefined,
  context: ProductVisualContext,
  promptKind: PromptKind | string | null | undefined,
): ResolvedModelReference | null {
  if (!promptKindUsesHumanModel(promptKind)) return null;

  for (const key of modelReferenceCandidates(context)) {
    const reference = modelReferences?.[key];
    if (reference?.storageId) return { key, storageId: reference.storageId };
  }
  return null;
}

export function resolveModelReferenceUrl(
  modelReferenceUrls: Record<string, string> | null | undefined,
  context: ProductVisualContext,
  promptKind: PromptKind | string | null | undefined,
) {
  if (!promptKindUsesHumanModel(promptKind)) return null;

  for (const key of modelReferenceCandidates(context)) {
    const url = modelReferenceUrls?.[key]?.trim();
    if (url) return url;
  }
  return null;
}

export function visualContextPromptVariables(
  context: ProductVisualContext,
  promptKind: PromptKind,
) {
  return {
    PROMPT_KIND: promptKind,
    TARGET_AUDIENCE: context.targetAudience,
    TARGET_GENDER: context.targetGender,
    MODEL_REFERENCE_KEY: context.modelReferenceKey ?? "",
    CONTEXT_CONFIDENCE: context.confidence.toFixed(2),
  };
}
