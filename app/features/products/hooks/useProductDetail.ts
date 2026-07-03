import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { productFilterArgs, type ProductSearch } from "@/lib/productFilters";
import { api, type Doc, type Id } from "@/lib/convex";

import type { ProductDetail, ProductNavigation } from "../types";

export function useProductDetail({
  productId,
  search,
}: {
  productId: string;
  search: ProductSearch;
}) {
  const [syncing, setSyncing] = useState(false);
  const syncProduct = useAction(api.shopify.syncProduct);
  const data = useQuery(api.products.getWithImages, {
    productId: productId as Id<"products">,
  }) as ProductDetail | undefined;
  const productNavigation = useQuery(api.products.navigation, {
    productId: productId as Id<"products">,
    ...productFilterArgs(search),
  }) as ProductNavigation | undefined;
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const shopInfo = useQuery(api.settings.shopInfo);

  async function sync() {
    const product = data?.product;
    if (!product) return;
    setSyncing(true);
    try {
      await syncProduct({ productId: product._id });
      toast.success("Product synced from Shopify");
    } catch (syncError) {
      toast.error("Sync failed", {
        description: errorMessage(syncError),
      });
    } finally {
      setSyncing(false);
    }
  }

  return {
    data,
    product: data?.product,
    images: data?.images ?? [],
    productNavigation,
    prompts,
    shopInfo,
    sync,
    syncing,
  };
}
