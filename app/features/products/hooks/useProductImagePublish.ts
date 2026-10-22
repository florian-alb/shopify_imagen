import { useAction } from "convex/react";
import { toast } from "sonner";
import { useRef, useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc, type Id } from "@/lib/convex";
import { initialPublicationSelection, selectedPublicationImages } from "../lib/productImageViews";

export function useProductImagePublish({ product, readyImages, groupId, onPublished }: {
  product: Doc<"products">;
  readyImages: Doc<"generatedImages">[];
  groupId: Id<"visualGroups"> | null;
  onPublished: () => void;
}) {
  const pushImages = useAction(api.shopify.pushProductImages);
  const [selectedPushIds, setSelectedPushIds] = useState<Set<Id<"generatedImages">>>(
    () => initialPublicationSelection(readyImages, groupId),
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replaceVariantMedia, setReplaceVariantMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function push() {
    const images = selectedPublicationImages(readyImages, selectedPushIds, groupId);
    if (!images.length || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await pushImages({
        productId: product._id,
        imageIds: images.map(image => image._id),
        replaceExisting,
        replaceVariantMedia,
      });
      onPublished();
      toast.success(`${images.length} image${images.length === 1 ? "" : "s"} publiée${images.length === 1 ? "" : "s"} dans Shopify`);
    } catch (pushError) {
      toast.error("Publication impossible", { description: errorMessage(pushError) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return { selectedPushIds, setSelectedPushIds, replaceExisting, setReplaceExisting,
    replaceVariantMedia, setReplaceVariantMedia, busy, push };
}
