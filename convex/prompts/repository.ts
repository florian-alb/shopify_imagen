import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { shopMatchesScope, type ShopScope } from "../shopScope";

type PromptReadCtx = {
  db: DatabaseReader;
};

export type PromptTemplateRow = Doc<"promptTemplates">;
export type PromptSettingsRow = Doc<"promptSettings">;

export function comparePrompts(
  a: { position?: number; imageType: string },
  b: { position?: number; imageType: string },
) {
  const pa = a.position ?? Number.POSITIVE_INFINITY;
  const pb = b.position ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  return a.imageType.localeCompare(b.imageType);
}

export async function promptsForScope(ctx: PromptReadCtx, scope: ShopScope) {
  if (scope.shopId) {
    const scoped = await ctx.db
      .query("promptTemplates")
      .withIndex("by_shop_and_position", (q) => q.eq("shopId", scope.shopId))
      .collect();
    if (!scope.includeLegacy) return scoped.sort(comparePrompts);

    const legacy = await ctx.db
      .query("promptTemplates")
      .withIndex("by_shop_and_position", (q) => q.eq("shopId", undefined))
      .collect();
    return [...scoped, ...legacy].sort(comparePrompts);
  }

  const prompts = await ctx.db
    .query("promptTemplates")
    .withIndex("by_shop_and_position", (q) => q.eq("shopId", undefined))
    .collect();
  return prompts.sort(comparePrompts);
}

export async function promptSettingsForScope(
  ctx: PromptReadCtx,
  scope: ShopScope,
) {
  const rows: PromptSettingsRow[] = [];
  if (scope.shopId) {
    const scoped = await ctx.db
      .query("promptSettings")
      .withIndex("by_shop", (q) => q.eq("shopId", scope.shopId))
      .collect();
    rows.push(...scoped);
    if (!scope.includeLegacy) {
      return firstByCreationTime(rows);
    }
  }

  const legacy = await ctx.db
    .query("promptSettings")
    .withIndex("by_shop", (q) => q.eq("shopId", undefined))
    .collect();
  rows.push(...legacy);
  return firstByCreationTime(rows);
}

export async function promptForActiveShop(
  ctx: PromptReadCtx,
  promptId: Id<"promptTemplates">,
  scope: ShopScope,
) {
  const prompt = await ctx.db.get(promptId);
  if (!prompt || !shopMatchesScope(prompt, scope)) {
    throw new Error("Prompt template not found.");
  }
  return prompt;
}

function firstByCreationTime<T extends { _creationTime: number }>(rows: T[]) {
  return rows.sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
}
