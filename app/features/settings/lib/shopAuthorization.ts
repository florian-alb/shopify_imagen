import type {
  ShopAuthorizationState,
  ShopifyAuthorizationStatus,
  ShopRow,
} from "../types";
import { normalizeShopDomain } from "./settingsHelpers";

export type ShopAuthorizationAction =
  | { type: "check_started"; shop: ShopRow }
  | {
      type: "check_succeeded";
      shop: ShopRow;
      authorization: ShopifyAuthorizationStatus;
      safeAuthorizationUrl: string | null;
    }
  | { type: "authorization_opened" }
  | { type: "check_failed"; shop: ShopRow; message: string }
  | { type: "closed" };

export const CLOSED_SHOP_AUTHORIZATION_STATE: ShopAuthorizationState = {
  status: "closed",
};

export function shopAuthorizationReducer(
  state: ShopAuthorizationState,
  action: ShopAuthorizationAction,
): ShopAuthorizationState {
  switch (action.type) {
    case "check_started":
      return { status: "checking", shop: action.shop };
    case "check_succeeded":
      if (action.authorization.status === "granted") {
        return {
          status: "granted",
          shop: action.shop,
          authorization: action.authorization,
        };
      }
      return {
        status: "authorization_required",
        shop: action.shop,
        authorization: action.authorization,
        safeAuthorizationUrl:
          action.authorization.status === "requested"
            ? action.safeAuthorizationUrl
            : null,
      };
    case "authorization_opened":
      if (
        state.status !== "authorization_required" ||
        state.authorization.status !== "requested"
      ) {
        return state;
      }
      return {
        status: "awaiting_approval",
        shop: state.shop,
        authorization: state.authorization,
      };
    case "check_failed":
      return {
        status: "error",
        shop: action.shop,
        message: action.message,
      };
    case "closed":
      return CLOSED_SHOP_AUTHORIZATION_STATE;
  }
}

export function shopAuthorizationKey(shop: ShopRow) {
  return shop._id ?? shop.domain;
}

export function authorizationMatchesShop(
  authorization: ShopifyAuthorizationStatus,
  shop: ShopRow,
) {
  const authorizationDomain = normalizeShopDomain(authorization.shopDomain);
  return (
    Boolean(authorizationDomain) &&
    authorizationDomain === normalizeShopDomain(shop.domain)
  );
}

export function authorizationRelevantScopes(
  authorization: ShopifyAuthorizationStatus,
) {
  if (authorization.status === "missing") return authorization.scopes.missing;
  if (authorization.status === "requested") {
    return authorization.scopes.requested;
  }
  return authorization.scopes.granted;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  );
}

export function parseShopifyAuthorizationStatus(
  value: unknown,
): ShopifyAuthorizationStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Réponse d'autorisation Shopify invalide.");
  }
  const candidate = value as Record<string, unknown>;
  const scopes = candidate.scopes;
  const status = candidate.status;
  const scopeRecord =
    scopes && typeof scopes === "object"
      ? (scopes as Record<string, unknown>)
      : null;
  const missingScopes = scopeRecord?.missing;
  const requestedScopes = scopeRecord?.requested;
  const grantedScopes = scopeRecord?.granted;
  const authorizationUrl = candidate.authorizationUrl;
  const hasExpectedAuthorizationUrl =
    status === "requested"
      ? authorizationUrl === null ||
        (typeof authorizationUrl === "string" &&
          authorizationUrl.trim().length > 0)
      : authorizationUrl === null;
  const scopeGroups = [missingScopes, requestedScopes, grantedScopes];
  const flatScopes = scopeGroups.every(isStringArray)
    ? scopeGroups.flat()
    : [];
  const hasScopePartition =
    flatScopes.length === new Set(flatScopes).size &&
    (status === "missing"
      ? Array.isArray(missingScopes) && missingScopes.length > 0
      : status === "requested"
        ? Array.isArray(missingScopes) &&
          missingScopes.length === 0 &&
          Array.isArray(requestedScopes) &&
          requestedScopes.length > 0
        : status === "granted"
          ? Array.isArray(missingScopes) &&
            missingScopes.length === 0 &&
            Array.isArray(requestedScopes) &&
            requestedScopes.length === 0
          : false);

  if (
    typeof candidate.shopDomain !== "string" ||
    (status !== "missing" && status !== "requested" && status !== "granted") ||
    !isStringArray(missingScopes) ||
    !isStringArray(requestedScopes) ||
    !isStringArray(grantedScopes) ||
    !hasScopePartition ||
    !hasExpectedAuthorizationUrl ||
    typeof candidate.checkedAt !== "number" ||
    !Number.isFinite(candidate.checkedAt) ||
    !Number.isFinite(new Date(candidate.checkedAt).getTime())
  ) {
    throw new Error("Réponse d'autorisation Shopify invalide.");
  }

  return {
    shopDomain: candidate.shopDomain,
    status,
    scopes: {
      missing: [...missingScopes],
      requested: [...requestedScopes],
      granted: [...grantedScopes],
    },
    authorizationUrl:
      status === "requested" && typeof authorizationUrl === "string"
        ? authorizationUrl
        : null,
    checkedAt: candidate.checkedAt,
  };
}
