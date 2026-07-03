import { useAction } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";

type PushApprovedOptions = {
  products: Doc<"products">[];
  pushableImages: Doc<"generatedImages">[];
  successMessage?: string;
};

export function useJobImagePublish() {
  const pushImages = useAction(api.shopify.pushProductImages);
  const [pushOpen, setPushOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushedProducts, setPushedProducts] = useState(0);

  async function pushApproved({ products, pushableImages, successMessage }: PushApprovedOptions) {
    const grouped = new Map<Id<"products">, Id<"generatedImages">[]>();
    for (const image of pushableImages) {
      grouped.set(image.productId, [...(grouped.get(image.productId) ?? []), image._id]);
    }
    if (!grouped.size) return false;

    setPushing(true);
    setPushedProducts(0);
    const errors: string[] = [];

    try {
      for (const [productId, imageIds] of grouped) {
        try {
          await pushImages({ productId, imageIds, replaceExisting });
        } catch (error) {
          const product = products.find((item) => item._id === productId);
          errors.push(`${product?.title ?? productId}: ${errorMessage(error)}`);
        } finally {
          setPushedProducts((count) => count + 1);
        }
      }
    } finally {
      setPushing(false);
    }

    if (errors.length) {
      toast.error(`${errors.length} product push${errors.length === 1 ? "" : "es"} failed`, {
        description: errors.join(" | "),
      });
      return false;
    } else {
      setPushOpen(false);
      toast.success(successMessage ?? `${pushableImages.length} image${pushableImages.length === 1 ? "" : "s"} pushed to Shopify`);
      return true;
    }
  }

  return {
    pushOpen,
    setPushOpen,
    replaceExisting,
    setReplaceExisting,
    pushing,
    pushedProducts,
    pushApproved,
  };
}
