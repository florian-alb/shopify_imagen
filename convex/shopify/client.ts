import { ConvexError } from "convex/values";

import type { ShopifyCredentials } from "../shopScope";

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function normalizeShopDomain(domain: string) {
  const trimmed = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!trimmed) throw new Error("SHOPIFY_SHOP_DOMAIN is required.");
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

export async function getAccessToken(credentials?: ShopifyCredentials) {
  const domain =
    credentials?.domain ?? normalizeShopDomain(env("SHOPIFY_SHOP_DOMAIN"));
  const clientId = credentials?.clientId ?? env("SHOPIFY_CLIENT_ID");
  const clientSecret = credentials?.clientSecret ?? env("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new ConvexError(
      "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response: Response;
  try {
    response = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    throw new ConvexError(
      `Shopify token request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new ConvexError(
      payload?.error_description ??
        payload?.error ??
        `Shopify token request failed with ${response.status}.`,
    );
  }

  return payload.access_token;
}

export async function shopifyGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  accessToken?: string,
  credentials?: ShopifyCredentials,
) {
  const domain =
    credentials?.domain ?? normalizeShopDomain(env("SHOPIFY_SHOP_DOMAIN"));
  const version = env("SHOPIFY_API_VERSION", "2026-04");
  const token = accessToken ?? (await getAccessToken(credentials));

  let response: Response;
  try {
    response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new ConvexError(
      `Shopify API request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | GraphQlResponse<T>
    | null;

  if (!response.ok) {
    const details = payload?.errors?.map((error) => error.message).join("; ");
    throw new ConvexError(
      `Shopify API request failed with ${response.status}${
        details ? `: ${details}` : ""
      }.`,
    );
  }

  if (payload?.errors?.length) {
    throw new ConvexError(payload.errors.map((error) => error.message).join("; "));
  }
  if (!payload?.data) {
    throw new ConvexError("Shopify API response did not include data.");
  }

  return payload.data;
}
