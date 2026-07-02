import { useAction } from "convex/react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { shopifyMediaId } from "@/features/shopify/lib/media";
import { errorMessage } from "@/lib/errors";
import { api, type Doc } from "@/lib/convex";

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
  const canReorderShopifyImages =
    shopifyImages.length > 1 &&
    shopifyImages.every((image) => shopifyMediaId(image));

  useEffect(() => {
    if (!localShopifyOrder || localShopifyOrder.productId !== productId) return;
    const localIds = localShopifyOrder.images.map(shopifyMediaId);
    const serverIds = serverShopifyImages.map(shopifyMediaId);
    if (
      localIds.length === serverIds.length &&
      localIds.every((id, index) => id === serverIds[index])
    ) {
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
    const from = shopifyImages.findIndex(
      (image) => shopifyMediaId(image) === draggedMediaId,
    );
    const to = shopifyImages.findIndex(
      (image) => shopifyMediaId(image) === overMediaId,
    );
    if (from === -1 || to === -1) return;
    const next = [...shopifyImages];
    const [draggedImage] = next.splice(from, 1);
    next.splice(to, 0, draggedImage);
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
        orderedMediaIds: localShopifyOrder.images.map(shopifyMediaId),
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
