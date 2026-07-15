import { useAction } from "convex/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/convex";
import {
  authorizationMatchesShop,
  CLOSED_SHOP_AUTHORIZATION_STATE,
  parseShopifyAuthorizationStatus,
  shopAuthorizationKey,
  shopAuthorizationReducer,
} from "../lib/shopAuthorization";
import { safeShopifyAuthorizationUrl } from "../lib/settingsHelpers";
import type { ShopRow } from "../types";

function authorizationErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Impossible de vérifier les autorisations Shopify.";
}

export function useShopAuthorization() {
  const fetchAuthorizationStatus = useAction(api.shopify.authorizationStatus);
  const beginAuthorization = useAction(api.shopify.beginAuthorization);
  const [state, dispatch] = useReducer(
    shopAuthorizationReducer,
    CLOSED_SHOP_AUTHORIZATION_STATE,
  );
  const selectedShopRef = useRef<ShopRow | null>(null);
  const requestSequenceRef = useRef(0);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      selectedShopRef.current = null;
    },
    [],
  );

  const check = useCallback(
    async (shop: ShopRow) => {
      const requestId = ++requestSequenceRef.current;
      const shopKey = shopAuthorizationKey(shop);
      dispatch({ type: "check_started", shop });

      try {
        const rawAuthorization = await fetchAuthorizationStatus(
          shop._id ? { shopId: shop._id } : {},
        );
        if (
          requestId !== requestSequenceRef.current ||
          !selectedShopRef.current ||
          shopAuthorizationKey(selectedShopRef.current) !== shopKey
        ) {
          return;
        }

        const authorization = parseShopifyAuthorizationStatus(rawAuthorization);
        if (!authorizationMatchesShop(authorization, shop)) {
          throw new Error(
            "La boutique vérifiée par Shopify ne correspond plus à la boutique sélectionnée.",
          );
        }

        const safeAuthorizationUrl = safeShopifyAuthorizationUrl(
          authorization.authorizationUrl,
          authorization.shopDomain,
        );

        dispatch({
          type: "check_succeeded",
          shop,
          authorization,
          safeAuthorizationUrl,
        });
      } catch (error) {
        if (
          requestId !== requestSequenceRef.current ||
          !selectedShopRef.current ||
          shopAuthorizationKey(selectedShopRef.current) !== shopKey
        ) {
          return;
        }
        dispatch({
          type: "check_failed",
          shop,
          message: authorizationErrorMessage(error),
        });
      }
    },
    [fetchAuthorizationStatus],
  );

  const open = useCallback(
    (shop: ShopRow) => {
      selectedShopRef.current = shop;
      void check(shop);
    },
    [check],
  );

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
    selectedShopRef.current = null;
    dispatch({ type: "closed" });
  }, []);

  const verify = useCallback(() => {
    const shop = selectedShopRef.current;
    if (shop) void check(shop);
  }, [check]);

  const authorize = useCallback(async () => {
    const shop = selectedShopRef.current;
    if (!shop || isAuthorizing) return;
    setIsAuthorizing(true);
    try {
      const result = await beginAuthorization(
        shop._id ? { shopId: shop._id } : {},
      );
      const safeUrl = safeShopifyAuthorizationUrl(
        result.authorizationUrl,
        shop.domain,
      );
      if (!safeUrl) {
        throw new Error(
          "Shopify n'a pas fourni de lien OAuth sûr pour cette boutique.",
        );
      }
      dispatch({ type: "authorization_opened" });
      window.location.assign(safeUrl);
    } catch (error) {
      dispatch({
        type: "check_failed",
        shop,
        message: authorizationErrorMessage(error),
      });
      setIsAuthorizing(false);
    }
  }, [beginAuthorization, isAuthorizing]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close],
  );

  return {
    state,
    isAuthorizing,
    isOpen: state.status !== "closed",
    open,
    close,
    verify,
    authorize,
    handleOpenChange,
  };
}
