import type { SettingDefinition, SettingsMap, ShopRow } from "../types";

export function normalizeShopDomain(value: string) {
  const cleaned = value
    .trim()
    .replace(new RegExp("^https?://"), "")
    .replace(new RegExp("/.*$"), "")
    .toLowerCase();
  if (!cleaned) return "";
  return cleaned.includes(".") ? cleaned : cleaned + ".myshopify.com";
}

export function shopHandle(value: string) {
  return normalizeShopDomain(value).replace(
    new RegExp("\\.myshopify\\.com$"),
    "",
  );
}

export function shopDisplayName(shop: ShopRow) {
  return shop.name || shop.storeHandle || shop.domain;
}

export function settingString(
  settings: SettingsMap | undefined,
  key: string,
  fallback = "",
) {
  const value = settings?.[key];
  return value === undefined || value === null ? fallback : String(value);
}

export function settingIsActive(definition: SettingDefinition, provider: string) {
  if (definition.scope === "shared") return true;
  if (definition.scope === "vibe") return true;
  return definition.scope === provider;
}
