import { Check, ShieldCheck, Store } from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Id } from "@/lib/convex";
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
  const isMobile = useIsMobile();

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="[&_td]:h-16 [&_th]:text-[0.72rem] [&_th]:font-medium [&_th]:text-muted-foreground">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Boutique</TableHead>
            <TableHead>Domaine</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Etat</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shops === undefined ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Chargement des boutiques...
              </TableCell>
            </TableRow>
          ) : shops.length ? (
            shops.map((shop) => (
              <TableRow key={shop._id ?? shop.domain}>
                <TableCell className="min-w-52">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                      <Store className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {shopDisplayName(shop)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {shop.productQuery || DEFAULT_PRODUCT_QUERY}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-56 font-mono text-xs">
                  {shop.domain}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {shop.source === "environment" ? "Env" : "Connectee"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {shop.isActive ? <Badge>Active</Badge> : null}
                    <Badge variant="outline">
                      {shop.hasClientCredentials
                        ? "Cles presentes"
                        : "Cles absentes"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size={isMobile ? "icon" : "sm"}
                      aria-label={`Vérifier l'accès Shopify de ${shopDisplayName(shop)}`}
                      title="Accès Shopify"
                      onClick={() => onCheckAuthorization(shop)}
                    >
                      <ShieldCheck />
                      {!isMobile ? "Accès Shopify" : null}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={isMobile ? "icon" : "sm"}
                      aria-label={`Utiliser ${shopDisplayName(shop)}`}
                      title="Utiliser cette boutique"
                      disabled={
                        !shop._id || shop.isActive || saving === shop._id
                      }
                      onClick={() => shop._id && onUseShop(shop._id)}
                    >
                      <BusyIcon busy={saving === shop._id} />
                      {saving !== shop._id ? <Check /> : null}
                      {!isMobile ? "Utiliser" : null}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Aucune boutique connectee.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
