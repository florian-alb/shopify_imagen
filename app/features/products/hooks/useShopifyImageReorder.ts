import { useAction } from "convex/react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc } from "@/lib/convex";
import {
  canReorderShopifyImageOrder,
  reorderShopifyImageOrder,
  shopifyImageIdsMatch,
  shopifyMediaIds,
} from "../lib";

import type { ShopifyGalleryImage } from "../types";

export function useShopifyImageReorder({
  productId,
  product,
  serverShopifyImages,
}: {
  productId: string;
  product: Doc<"products"> | null | undefined;
  serverShopifyImages: ShopifyGalleryImage[];
}) {
  const reorderProductImages = useAction(api.shopify.reorderProductImages);
  const [busy, setBusy] = useState(false);
  const [dragShopifyMediaId, setDragShopifyMediaId] = useState<string | null>(
    null,
  );
  const dragShopifyMediaIdRef = useRef<string | null>(null);
  const [localShopifyOrder, setLocalShopifyOrder] = useState<{
    productId: string;
    images: ShopifyGalleryImage[];
  } | null>(null);

  const shopifyImages =
    localShopifyOrder?.productId === productId
      ? localShopifyOrder.images
      : serverShopifyImages;
  const canReorderShopifyImages = canReorderShopifyImageOrder(shopifyImages);

  useEffect(() => {
    if (!localShopifyOrder || localShopifyOrder.productId !== productId) return;
    if (shopifyImageIdsMatch(localShopifyOrder.images, serverShopifyImages)) {
      setLocalShopifyOrder(null);
    }
  }, [localShopifyOrder, productId, serverShopifyImages]);

  function startShopifyImageReorder(mediaId: string) {
    dragShopifyMediaIdRef.current = mediaId;
    setDragShopifyMediaId(mediaId);
  }

  function reorderShopifyImageOver(overMediaId: string) {
    const draggedMediaId = dragShopifyMediaIdRef.current;
    if (!draggedMediaId || draggedMediaId === overMediaId) return;
    const next = reorderShopifyImageOrder(
      shopifyImages,
      draggedMediaId,
      overMediaId,
    );
    if (next === shopifyImages) return;

    setLocalShopifyOrder({ productId, images: next });
  }

  async function commitShopifyImageReorder() {
    if (!product || !dragShopifyMediaIdRef.current) return;
    dragShopifyMediaIdRef.current = null;
    setDragShopifyMediaId(null);
    if (!localShopifyOrder || localShopifyOrder.productId !== productId) return;

    setBusy(true);
    try {
      const result = await reorderProductImages({
        productId: product._id,
        orderedMediaIds: shopifyMediaIds(localShopifyOrder.images),
      });
      toast.success(
        result.pending
          ? "Shopify image reorder queued"
          : "Shopify image order saved",
        {
          description: result.pending
            ? "Shopify is still applying new gallery order."
            : "Prompt references now follow this gallery order.",
        },
      );
    } catch (reorderError) {
      setLocalShopifyOrder(null);
      toast.error("Failed to reorder Shopify images", {
        description: errorMessage(reorderError),
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    shopifyImages,
    canReorderShopifyImages,
    busy,
    dragShopifyMediaId,
    startShopifyImageReorder,
    reorderShopifyImageOver,
    commitShopifyImageReorder,
  };
}
