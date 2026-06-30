import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope,
} from "../shopScope";

export const modelReferenceKeys = [
  "adult_female",
  "adult_male",
  "adult_unisex",
  "child_female",
  "child_male",
  "child_unisex",
  "default",
] as const;

export type ModelReferenceKey = (typeof modelReferenceKeys)[number];

export type StoredModelReference = {
  storageId: Id<"_storage">;
  fileName?: string;
  contentType?: string;
  size?: number;
  updatedAt: number;
};

export type ModelReferencePayload = StoredModelReference & {
  url: string | null;
};

type PromptStorageCtx = {
  storage: QueryCtx["storage"];
};

export function validateModelReferenceKey(key: string): ModelReferenceKey {
  const normalized = key.trim();
  if (modelReferenceKeys.includes(normalized as ModelReferenceKey)) {
    return normalized as ModelReferenceKey;
  }
  throw new Error(`Unsupported model reference key "${key}".`);
}

export function sanitizeModelReferenceUrls(
  raw: Doc<"promptSettings">["modelReferenceUrls"],
): Record<string, string> {
  if (!raw) return {};
  const values = raw as Record<string, string>;
  const cleaned: Record<string, string> = {};
  for (const key of modelReferenceKeys) {
    const value = values[key]?.trim();
    if (value) cleaned[key] = value;
  }
  return cleaned;
}

export function sanitizeModelReferences(
  raw: Doc<"promptSettings">["modelReferences"],
): Partial<Record<ModelReferenceKey, StoredModelReference>> {
  if (!raw) return {};
  const values = raw as Record<string, StoredModelReference>;
  const cleaned: Partial<Record<ModelReferenceKey, StoredModelReference>> = {};
  for (const key of modelReferenceKeys) {
    const value = values[key];
    if (!value?.storageId) continue;
    cleaned[key] = {
      storageId: value.storageId,
      ...(value.fileName ? { fileName: value.fileName } : {}),
      ...(value.contentType ? { contentType: value.contentType } : {}),
      ...(typeof value.size === "number" ? { size: value.size } : {}),
      updatedAt: value.updatedAt,
    };
  }
  return cleaned;
}

export async function modelReferenceUrlMap(
  ctx: PromptStorageCtx,
  settings: Doc<"promptSettings"> | null,
): Promise<Record<string, string>> {
  const urls = sanitizeModelReferenceUrls(settings?.modelReferenceUrls);
  const references = sanitizeModelReferences(settings?.modelReferences);

  for (const [key, reference] of Object.entries(references)) {
    if (!reference) continue;
    const url = await ctx.storage.getUrl(reference.storageId);
    if (url) urls[key] = url;
  }

  return urls;
}

export async function masterPromptPayload(
  ctx: PromptStorageCtx,
  scope: ShopScope,
  settings: Doc<"promptSettings"> | null,
) {
  const references = sanitizeModelReferences(settings?.modelReferences);
  const modelReferences: Partial<
    Record<ModelReferenceKey, ModelReferencePayload>
  > = {};

  for (const [key, reference] of Object.entries(references)) {
    if (!reference) continue;
    modelReferences[key as ModelReferenceKey] = {
      ...reference,
      url: await ctx.storage.getUrl(reference.storageId),
    };
  }

  return {
    shopId: scope.shopId ?? null,
    masterPrompt: settings?.masterPrompt ?? "",
    modelReferences,
    updatedAt: settings?.updatedAt ?? null,
  };
}

export async function getPromptForActiveShop(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  promptId: Id<"promptTemplates">,
  userId: Id<"users">,
) {
  const scope = await getActiveShopScope(ctx, userId);
  const prompt = (await ctx.db.get(promptId)) as Doc<"promptTemplates"> | null;
  if (!prompt || !shopMatchesScope(prompt, scope)) {
    throw new Error("Prompt not found.");
  }
  return { prompt, scope };
}
