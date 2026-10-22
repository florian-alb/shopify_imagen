import { Check, ShieldCheck, Store } from "lucide-react";
import { BusyIcon, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id } from "@/lib/convex";
import { DEFAULT_PRODUCT_QUERY } from "../settingsData";
import { shopDisplayName } from "../lib/settingsHelpers";
import type { ShopRow } from "../types";

export function ShopTable({
  shops,
  saving,
  onCheckAuthorization,
  onUseShop,
}: {
  shops: ShopRow[] | undefined;
  saving: string | null;
  onCheckAuthorization: (shop: ShopRow) => void;
  onUseShop: (shopId: Id<"shops">) => void;
}) {
  if (shops === undefined)
    return (
      <EmptyState
        loading
        title="Chargement des boutiques"
        body="Lecture des connexions disponibles."
      />
    );
  if (!shops.length)
    return (
      <EmptyState
        title="Connectez votre première boutique"
        body="Ajoutez son domaine et les clés de son application Shopify pour commencer."
      />
    );
  return (
    <ul className="overflow-hidden rounded-xl border bg-card" aria-label="Boutiques enregistrées">
      {shops.map((shop) => (
        <li
          key={shop._id ?? shop.domain}
          className="grid min-w-0 gap-4 border-b p-5 last:border-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${shop.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              <Store className="size-5" />
            </span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words font-semibold">{shopDisplayName(shop)}</h3>
                {shop.isActive && <Badge>Boutique active</Badge>}
              </div>
              <p className="break-all text-sm text-muted-foreground">{shop.domain}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{shop.hasClientCredentials ? "Clés enregistrées" : "Clés absentes"}</span>
                <span>
                  {shop.source === "environment"
                    ? "Configuration serveur"
                    : "Ajoutée dans l’application"}
                </span>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Filtre des produits synchronisés</summary>
                <p className="mt-2 break-all font-mono">
                  {shop.productQuery || DEFAULT_PRODUCT_QUERY}
                </p>
              </details>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:ml-0 lg:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-label={`Vérifier l’accès Shopify de ${shopDisplayName(shop)}`}
              onClick={() => onCheckAuthorization(shop)}
              disabled={saving !== null}
            >
              <ShieldCheck />
              Vérifier l’accès
            </Button>
            <Button
              type="button"
              variant={shop.isActive ? "ghost" : "outline"}
              className="min-h-11"
              disabled={!shop._id || shop.isActive || saving !== null}
              onClick={() => shop._id && onUseShop(shop._id)}
            >
              <BusyIcon busy={saving === shop._id} />
              {saving !== shop._id && <Check />}
              {shop.isActive ? "Active" : "Utiliser"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
