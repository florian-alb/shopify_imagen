import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shopDisplayName } from "../lib/settingsHelpers";
import type { ShopRow } from "../types";

export function ActiveShopBanner({
  shop,
  loading,
  onChange,
}: {
  shop: ShopRow | null;
  loading: boolean;
  onChange: () => void;
}) {
  return (
    <section className="mb-4 rounded-lg border border-white/10 bg-white/3 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
              <Store className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {loading
                  ? "Chargement de la boutique"
                  : shop
                    ? shopDisplayName(shop)
                    : "Aucune boutique active"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {shop?.domain ??
                  "Connecte une boutique pour synchroniser Shopify."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shop?.isActive ? <Badge>Active</Badge> : null}
          {shop?.source === "environment" ? (
            <Badge variant="outline">Env</Badge>
          ) : null}
          {shop ? (
            <Badge variant="outline">
              {shop.hasClientCredentials ? "Cles presentes" : "Cles absentes"}
            </Badge>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onChange}>
            Changer
          </Button>
        </div>
      </div>
    </section>
  );
}
