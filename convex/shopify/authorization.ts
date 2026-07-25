import { ConvexError } from "convex/values";

import {
  normalizeShopDomain,
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
  app: {
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

export function buildShopifyAuthorizationStatus(
  installation: ShopifyAuthorizationInstallation,
  shopDomain: string,
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
    authorizationUrl: null,
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
