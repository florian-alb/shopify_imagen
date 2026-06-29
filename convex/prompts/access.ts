import type { Doc, Id } from "../_generated/dataModel";
import { defaultMasterPrompt } from "../promptDefaults";
import {
  getActiveShopScope,
  shopMatchesScope,
  type ShopScope,
} from "../shopScope";

export function masterPromptPayload(
  scope: ShopScope,
  settings: Doc<"promptSettings"> | null,
) {
  return {
    shopId: scope.shopId ?? null,
    masterPrompt: settings?.masterPrompt ?? defaultMasterPrompt,
    defaultMasterPrompt: settings?.defaultMasterPrompt ?? defaultMasterPrompt,
    updatedAt: settings?.updatedAt ?? null,
  };
}

export async function getPromptForActiveShop(
  ctx: { db: any },
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
