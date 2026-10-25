import { shopifyStatusLabel, productGenerationStateLabels, productReviewStateLabels, productPublishStateLabels } from "@/lib/status";
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
    <section className="studio-panel p-5">
      <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
        <Fact label="Identifiant dans la boutique" value={product.handle} />
        <Fact label="Fournisseur" value={product.vendor || "Non renseigné"} />
        <Fact label="Catégorie" value={product.productType || "Sans catégorie"} />
        <Fact label="Génération" value={productGenerationStateLabels[product.generationState ?? "not_started"]} />
        <Fact label="Vérification" value={productReviewStateLabels[product.reviewState ?? "none"]} />
        <Fact label="Publication" value={productPublishStateLabels[product.publishState ?? "not_ready"]} />
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
          label="Dernière synchronisation"
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
      <dt className="text-xs font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
