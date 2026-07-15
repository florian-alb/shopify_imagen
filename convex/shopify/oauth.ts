import { ConvexError } from "convex/values";

import { normalizeShopDomain, type ShopifyCredentials } from "../shopScope";

const OAUTH_STATE_PATTERN = /^[a-f0-9]{64}$/;
const HMAC_PATTERN = /^[a-f0-9]{64}$/i;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(value: string) {
  if (value.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function requireSingleQueryParam(url: URL, name: string) {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || !values[0]) {
    throw new Error(`Shopify OAuth callback is missing ${name}.`);
  }
  return values[0];
}

export function createShopifyOAuthState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashShopifyOAuthState(state: string) {
  if (!OAUTH_STATE_PATTERN.test(state)) {
    throw new Error("Shopify OAuth state is invalid.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(state),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function shopifyOAuthCallbackUrl() {
  const explicit = process.env.SHOPIFY_OAUTH_REDIRECT_URL?.trim();
  const convexSiteUrl = process.env.CONVEX_SITE_URL?.trim();
  const rawUrl =
    explicit ||
    (convexSiteUrl ? `${convexSiteUrl}/shopify/oauth/callback` : "");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConvexError(
      "SHOPIFY_OAUTH_REDIRECT_URL or CONVEX_SITE_URL must define the Shopify OAuth callback URL.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new ConvexError("The Shopify OAuth callback URL must be a safe HTTPS URL.");
  }
  return url.toString();
}

export function buildShopifyOAuthAuthorizationUrl(
  credentials: ShopifyCredentials,
  state: string,
  redirectUri: string,
  scopes: readonly string[],
) {
  const domain = normalizeShopDomain(credentials.domain);
  const clientId = credentials.clientId.trim();
  if (!clientId || !OAUTH_STATE_PATTERN.test(state) || !scopes.length) {
    throw new Error("Shopify OAuth authorization parameters are invalid.");
  }

  const callback = new URL(redirectUri);
  if (callback.protocol !== "https:") {
    throw new Error("Shopify OAuth callback must use HTTPS.");
  }

  const url = new URL(`https://${domain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("redirect_uri", callback.toString());
  url.searchParams.set("state", state);
  return url.toString();
}

export type ShopifyOAuthCallback = {
  code: string;
  shopDomain: string;
  state: string;
};

export function parseShopifyOAuthCallback(url: URL): ShopifyOAuthCallback {
  const code = requireSingleQueryParam(url, "code");
  const shopDomain = normalizeShopDomain(requireSingleQueryParam(url, "shop"));
  const state = requireSingleQueryParam(url, "state");
  if (!OAUTH_STATE_PATTERN.test(state)) {
    throw new Error("Shopify OAuth callback state is invalid.");
  }
  return { code, shopDomain, state };
}

function oauthHmacMessage(url: URL) {
  return Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function verifyShopifyOAuthHmac(url: URL, clientSecret: string) {
  const hmacValues = url.searchParams.getAll("hmac");
  if (
    hmacValues.length !== 1 ||
    !HMAC_PATTERN.test(hmacValues[0] ?? "") ||
    !clientSecret
  ) {
    return false;
  }
  const signature = hexToBytes(hmacValues[0]);
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(oauthHmacMessage(url)),
  );
}

export type ShopifyOAuthToken = {
  accessToken: string;
  scopes: string[];
};

export async function exchangeShopifyOAuthCode(
  credentials: ShopifyCredentials,
  code: string,
): Promise<ShopifyOAuthToken> {
  const domain = normalizeShopDomain(credentials.domain);
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ??
        payload?.error ??
        `Shopify OAuth token exchange failed with ${response.status}.`,
    );
  }
  return {
    accessToken: payload.access_token,
    scopes: Array.from(
      new Set(
        (payload.scope ?? "")
          .split(",")
          .map((scope) => scope.trim().toLowerCase())
          .filter(Boolean),
      ),
    ),
  };
}
