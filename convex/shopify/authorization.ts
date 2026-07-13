import { ConvexError } from "convex/values";

import {
  normalizeShopDomain,
  storeHandleFromDomain,
  type ShopifyCredentials,
} from "../shopScope";
import { shopifyGraphql } from "./client";
import { SHOPIFY_AUTHORIZATION_STATUS_QUERY } from "./graphql";

export const REQUIRED_SHOPIFY_ADMIN_SCOPES = [
  "write_products",
  "write_files",
] as const;

export type RequiredShopifyAdminScope =
  (typeof REQUIRED_SHOPIFY_ADMIN_SCOPES)[number];

export type ShopifyAuthorizationInstallation = {
  launchUrl: string | null;
  app: {
    installUrl: string | null;
    requestedAccessScopes: Array<{ handle: string }>;
  };
  accessScopes: Array<{ handle: string }>;
};

export type ShopifyAuthorizationStatus = {
  shopDomain: string;
  status: "missing" | "requested" | "granted";
  scopes: {
    missing: string[];
    requested: string[];
    granted: string[];
  };
  authorizationUrl: string | null;
  checkedAt: number;
};

function normalizeScopeHandles(scopes: Array<{ handle: string }>) {
  return new Set(
    scopes
      .map((scope) => scope.handle.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hasExplicitPort(rawUrl: string) {
  const authority = rawUrl.match(/^https:\/\/([^/?#]+)/i)?.[1] ?? "";
  const host = authority.split("@").at(-1) ?? "";
  return host.includes(":");
}

export function validateShopifyAuthorizationUrl(
  rawUrl: string,
  shopDomain: string,
  clientId: string,
) {
  const expectedDomain = normalizeShopDomain(shopDomain);
  const expectedStoreHandle = storeHandleFromDomain(expectedDomain);
  const expectedClientId = clientId.trim();
  if (
    !rawUrl ||
    rawUrl !== rawUrl.trim() ||
    !expectedClientId ||
    hasExplicitPort(rawUrl)
  ) {
    throw new Error("Shopify returned an invalid authorization URL.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Shopify returned an invalid authorization URL.");
  }

  const hasSafeBase =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash;
  const isExpectedPermissionRedirect =
    hasSafeBase &&
    !url.search &&
    url.hostname.toLowerCase() === expectedDomain &&
    /^\/admin\/api_permissions\/[0-9]+\/redirect$/.test(url.pathname);

  const queryEntries = Array.from(url.searchParams.entries());
  const isExpectedManagedInstall =
    hasSafeBase &&
    url.hostname.toLowerCase() === "admin.shopify.com" &&
    url.pathname === `/store/${expectedStoreHandle}/oauth/install` &&
    queryEntries.length === 1 &&
    queryEntries[0]?.[0] === "client_id" &&
    queryEntries[0]?.[1] === expectedClientId;

  if (!isExpectedPermissionRedirect && !isExpectedManagedInstall) {
    throw new Error("Shopify returned an unsafe authorization URL.");
  }

  return url.toString();
}

function authorizationUrl(
  installation: ShopifyAuthorizationInstallation,
  shopDomain: string,
  clientId: string,
) {
  const candidates = [installation.launchUrl, installation.app.installUrl];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return validateShopifyAuthorizationUrl(candidate, shopDomain, clientId);
    } catch {
      // Shopify can evolve one managed URL while the other remains usable.
    }
  }
  throw new Error("Shopify did not return a safe authorization URL.");
}

export function buildShopifyAuthorizationStatus(
  installation: ShopifyAuthorizationInstallation,
  shopDomain: string,
  clientId: string,
  checkedAt = Date.now(),
): ShopifyAuthorizationStatus {
  const normalizedDomain = normalizeShopDomain(shopDomain);
  const configured = normalizeScopeHandles(
    installation.app.requestedAccessScopes,
  );
  const installed = normalizeScopeHandles(installation.accessScopes);
  const missingScopes = REQUIRED_SHOPIFY_ADMIN_SCOPES.filter(
    (scope) => !configured.has(scope),
  );
  const requestedScopes = REQUIRED_SHOPIFY_ADMIN_SCOPES.filter(
    (scope) => configured.has(scope) && !installed.has(scope),
  );
  const grantedScopes = REQUIRED_SHOPIFY_ADMIN_SCOPES.filter(
    (scope) => configured.has(scope) && installed.has(scope),
  );
  const status = missingScopes.length
    ? "missing"
    : requestedScopes.length
      ? "requested"
      : "granted";

  return {
    shopDomain: normalizedDomain,
    status,
    scopes: {
      missing: missingScopes,
      requested: requestedScopes,
      granted: grantedScopes,
    },
    authorizationUrl:
      status === "requested"
        ? authorizationUrl(installation, normalizedDomain, clientId)
        : null,
    checkedAt,
  };
}

export async function fetchShopifyAuthorizationStatus(
  credentials: ShopifyCredentials,
) {
  const data = await shopifyGraphql<{
    currentAppInstallation: ShopifyAuthorizationInstallation | null;
  }>(SHOPIFY_AUTHORIZATION_STATUS_QUERY, {}, undefined, credentials);
  if (!data.currentAppInstallation) {
    throw new ConvexError(
      "L'application Shopify n'est pas installée sur cette boutique.",
    );
  }

  try {
    return buildShopifyAuthorizationStatus(
      data.currentAppInstallation,
      credentials.domain,
      credentials.clientId,
    );
  } catch (error) {
    throw new ConvexError(
      error instanceof Error
        ? error.message
        : "Impossible de vérifier les autorisations Shopify.",
    );
  }
}

export function requireShopifyAdminScopes(
  status: ShopifyAuthorizationStatus,
  requiredScopes: readonly RequiredShopifyAdminScope[],
) {
  const missingScopes = requiredScopes.filter((scope) =>
    status.scopes.missing.includes(scope),
  );
  if (missingScopes.length) {
    throw new ConvexError(
      `Le scope Shopify ${missingScopes.join(
        ", ",
      )} n'est pas publié dans la configuration Admin API de l'application. Ajoute-le, enregistre puis déploie la configuration avant de réessayer.`,
    );
  }

  const requestedScopes = requiredScopes.filter((scope) =>
    status.scopes.requested.includes(scope),
  );
  if (requestedScopes.length) {
    throw new ConvexError(
      `Le scope Shopify ${requestedScopes.join(
        ", ",
      )} est configuré, mais l'installation actuelle ne l'a pas encore approuvé. Ouvre Paramètres > Boutique > Accès Shopify, puis réautorise la boutique avant de relancer la publication.`,
    );
  }
}
