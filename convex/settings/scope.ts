import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { shopMatchesScope, type ShopScope } from "../shopScope";

type SettingsReadCtx = {
  db: DatabaseReader;
};

export type AppSettingRow = Doc<"appSettings">;
export type SettingsDefaults = Record<string, unknown>;

export function settingsRowsToObject(defaults: SettingsDefaults, rows: AppSettingRow[]) {
  return {
    ...defaults,
    ...Object.fromEntries(rows.map((row) => [row.key, row.value]))
  };
}

export async function settingsForScope(ctx: SettingsReadCtx, scope: ShopScope) {
  const rows = await ctx.db.query("appSettings").collect();
  return rows.filter((row) => shopMatchesScope(row, scope));
}

export async function settingsForShopId(ctx: SettingsReadCtx, shopId?: Id<"shops"> | null) {
  const rows = await ctx.db.query("appSettings").collect();
  return rows.filter((row) => (shopId ? row.shopId === shopId : row.shopId == null));
}

export async function settingForShop(ctx: SettingsReadCtx, shopId: Id<"shops">, key: string) {
  return ctx.db
    .query("appSettings")
    .withIndex("by_shop_and_key", (q) => q.eq("shopId", shopId).eq("key", key))
    .unique();
}

export async function legacySettingForKey(ctx: SettingsReadCtx, key: string) {
  const legacy = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return legacy?.shopId == null ? legacy : null;
}
