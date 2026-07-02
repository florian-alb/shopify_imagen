import { shopifyStatusLabel } from "@/lib/status";
import type { Doc } from "@/lib/convex";

import type { ShopifyCollection } from "../types";

export function ProductFacts({
  product,
  productCollections,
  imageCount,
}: {
  product: Doc<"products">;
  productCollections: ShopifyCollection[];
  imageCount: number;
}) {
  return (
    <section className="studio-card rounded-lg border p-4">
      <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
        <Fact
          label="Collections"
          value={
            productCollections
              .map((collection) => collection.title)
              .join(", ") || "Aucune"
          }
        />
        <Fact
          label="Statut Shopify"
          value={shopifyStatusLabel(product.shopifyStatus)}
        />
        <Fact
          label="Dernier sync"
          value={
            product.lastSyncedAt
              ? new Date(product.lastSyncedAt).toLocaleString()
              : "Jamais"
          }
        />
        <Fact label="Historique" value={`${imageCount} images`} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
