import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import type { ShopifyCredentials } from "./shopScope";
import {
  exchangeShopifyOAuthCode,
  hashShopifyOAuthState,
  parseShopifyOAuthCallback,
  verifyShopifyOAuthHmac,
} from "./shopify/oauth";

const http = httpRouter();

auth.addHttpRoutes(http);

function settingsRedirect(status: "success" | "error") {
  const rawSiteUrl = process.env.SITE_URL?.trim() ?? "";
  let siteUrl: URL;
  try {
    siteUrl = new URL(rawSiteUrl);
  } catch {
    throw new Error("SITE_URL must be configured for Shopify OAuth redirects.");
  }
  const isSafeLocalUrl =
    siteUrl.protocol === "http:" &&
    (siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1");
  if (
    (siteUrl.protocol !== "https:" && !isSafeLocalUrl) ||
    siteUrl.username ||
    siteUrl.password
  ) {
    throw new Error("SITE_URL must be a safe application URL.");
  }
  const redirect = new URL("/settings/", siteUrl);
  redirect.searchParams.set("shopify_oauth", status);
  return redirect;
}

http.route({
  path: "/shopify/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const state = url.searchParams.get("state") ?? "";
      const stateHash = await hashShopifyOAuthState(state);
      const attempt = await ctx.runQuery(
        internal.shopify.getShopifyOauthAttempt,
        { stateHash },
      );
      if (!attempt) {
        throw new Error("Shopify OAuth attempt is invalid or expired.");
      }
      const credentials = attempt.credentials as ShopifyCredentials;
      if (!(await verifyShopifyOAuthHmac(url, credentials.clientSecret))) {
        throw new Error("Shopify OAuth callback signature is invalid.");
      }
      const callback = parseShopifyOAuthCallback(url);
      if (callback.shopDomain !== attempt.shopDomain) {
        throw new Error("Shopify OAuth callback shop does not match the request.");
      }
      const token = await exchangeShopifyOAuthCode(credentials, callback.code);
      await ctx.runMutation(internal.shopify.completeShopifyOauthAttempt, {
        stateHash,
        shopDomain: callback.shopDomain,
        accessToken: token.accessToken,
        scopes: token.scopes,
      });
      return Response.redirect(settingsRedirect("success"), 303);
    } catch {
      try {
        return Response.redirect(settingsRedirect("error"), 303);
      } catch {
        return new Response("Shopify OAuth authorization failed.", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }
  }),
});

export default http;
