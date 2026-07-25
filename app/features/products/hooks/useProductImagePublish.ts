import { useAction } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

export function useProductImagePublish({
  product,
  readyImages,
  publishMode,
}: {
  product: Doc<"products"> | null | undefined;
  readyImages: Doc<"generatedImages">[];
  publishMode: "variant_media" | "separate_products" | null;
}) {
  const pushImages = useAction(api.shopify.pushProductImages);
  const [open, setOpen] = useState(false);
  const [selectedPushIds, setSelectedPushIds] = useState<
    Set<Id<"generatedImages">>
  >(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replaceVariantMedia, setReplaceVariantMedia] = useState(true);
  const [focusedGroupId, setFocusedGroupId] =
    useState<Id<"visualGroups"> | null>(null);
  const [busy, setBusy] = useState(false);

  function openWithImages(
    images: Doc<"generatedImages">[],
    focusGroupId: Id<"visualGroups"> | null,
  ) {
    setSelectedPushIds(new Set(images.map((image) => image._id)));
    setFocusedGroupId(focusGroupId);
    setReplaceExisting(false);
    setReplaceVariantMedia(true);
    setOpen(true);
  }

  function openPush() {
    openWithImages(readyImages, null);
  }

  function openPushForGroup(groupId: Id<"visualGroups">) {
    openWithImages(
      readyImages.filter((image) => image.visualGroupId === groupId),
      groupId,
    );
  }

  async function push() {
    if (!product || !selectedPushIds.size) return;
    const count = selectedPushIds.size;
    setBusy(true);
    try {
      const result = await pushImages({
        productId: product._id,
        imageIds: readyImages
          .filter((image) => selectedPushIds.has(image._id))
          .map((image) => image._id),
        replaceExisting,
        replaceVariantMedia,
      });
      setOpen(false);
      if (result.publishMode === "separate_products") {
        const productCount = result.createdProducts.length;
        toast.success(
          `${productCount} produit${productCount === 1 ? "" : "s"} brouillon${
            productCount === 1 ? "" : "s"
          } créé${productCount === 1 ? "" : "s"} dans Shopify`,
        );
      } else {
        toast.success(
          `${count} image${count === 1 ? "" : "s"} publiée${
            count === 1 ? "" : "s"
          } dans Shopify`,
        );
      }
    } catch (pushError) {
      toast.error("Push failed", {
        description: errorMessage(pushError),
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    selectedPushIds,
    setSelectedPushIds,
    replaceExisting,
    setReplaceExisting,
    replaceVariantMedia,
    setReplaceVariantMedia,
    focusedGroupId,
    publishMode,
    busy,
    openPush,
    openPushForGroup,
    push,
  };
}
