import type { SettingDefinition, SettingsMap, ShopRow } from "../types";

const SHOP_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SHOPIFY_ADMIN_HOST = "admin.shopify.com";
const MYSHOPIFY_SUFFIX = ".myshopify.com";

function hasExplicitPort(value: string) {
  const authority = value.match(/^https?:\/\/([^/?#]+)/i)?.[1] ?? "";
  const host = authority.split("@").at(-1) ?? "";
  return host.includes(":");
}

export function normalizeShopDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let hostname = trimmed.toLowerCase();
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return "";
    }
    if (
      url.username ||
      url.password ||
      url.port ||
      hasExplicitPort(trimmed) ||
      url.search ||
      url.hash ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      return "";
    }
    hostname = url.hostname.toLowerCase();
  } else if (/[/:?#@]/.test(hostname)) {
    return "";
  }

  const handle = hostname.endsWith(MYSHOPIFY_SUFFIX)
    ? hostname.slice(0, -MYSHOPIFY_SUFFIX.length)
    : hostname;
  if (hostname.includes(".") && !hostname.endsWith(MYSHOPIFY_SUFFIX)) return "";
  if (handle.length > 63 || !SHOP_HANDLE_PATTERN.test(handle)) return "";
  return handle + MYSHOPIFY_SUFFIX;
}

export function shopHandle(value: string) {
  const domain = normalizeShopDomain(value);
  return domain ? domain.slice(0, -MYSHOPIFY_SUFFIX.length) : "";
}

export function safeShopifyAuthorizationUrl(
  value: string | null,
  shopDomain: string,
) {
  if (!value || value !== value.trim() || hasExplicitPort(value)) return null;
  const expectedDomain = normalizeShopDomain(shopDomain);
  const expectedHandle = shopHandle(expectedDomain);
  if (!expectedDomain || !expectedHandle) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return null;
  }

  const isShopPermissionRedirect =
    url.hostname.toLowerCase() === expectedDomain &&
    !url.search &&
    /^\/admin\/api_permissions\/[0-9]+\/redirect$/.test(url.pathname);

  const clientIds = url.searchParams.getAll("client_id");
  const hasOnlyClientId =
    clientIds.length === 1 &&
    Boolean(clientIds[0]?.trim()) &&
    Array.from(url.searchParams.keys()).every((key) => key === "client_id");
  const isAdminInstallUrl =
    url.hostname.toLowerCase() === SHOPIFY_ADMIN_HOST &&
    url.pathname === `/store/${expectedHandle}/oauth/install` &&
    hasOnlyClientId;

  return isShopPermissionRedirect || isAdminInstallUrl ? url.toString() : null;
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
