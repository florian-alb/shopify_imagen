import { useAction } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";

export function useProductImagePublish({
  product,
  readyImages,
}: {
  product: Doc<"products"> | null | undefined;
  readyImages: Doc<"generatedImages">[];
}) {
  const pushImages = useAction(api.shopify.pushProductImages);
  const [open, setOpen] = useState(false);
  const [selectedPushIds, setSelectedPushIds] = useState<
    Set<Id<"generatedImages">>
  >(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  function openPush() {
    setSelectedPushIds(new Set(readyImages.map((image) => image._id)));
    setReplaceExisting(false);
    setOpen(true);
  }

  async function push() {
    if (!product || !selectedPushIds.size) return;
    const count = selectedPushIds.size;
    setBusy(true);
    try {
      await pushImages({
        productId: product._id,
        imageIds: readyImages
          .filter((image) => selectedPushIds.has(image._id))
          .map((image) => image._id),
        replaceExisting,
      });
      setOpen(false);
      toast.success(
        `Pushed ${count} image${count === 1 ? "" : "s"} to Shopify`,
      );
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
    busy,
    openPush,
    push,
  };
}
