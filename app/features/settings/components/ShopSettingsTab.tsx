import { RefreshCw } from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { Id } from "@/lib/convex";
import { useShopAuthorization } from "../hooks/useShopAuthorization";
import type { useShopConnection } from "../hooks/useShopConnection";
import type { ShopRow } from "../types";
import { ShopAuthorizationDialog } from "./ShopAuthorizationDialog";
import { ShopOnboarding } from "./ShopOnboarding";
import { ShopTable } from "./ShopTable";

export function ShopSettingsTab({
  connection,
  saving,
  shops,
  activeShop,
  syncing,
  onSync,
  onUseShop,
}: {
  connection: ReturnType<typeof useShopConnection>;
  saving: string | null;
  shops: ShopRow[] | undefined;
  activeShop: ShopRow | null;
  syncing: boolean;
  onSync: () => void;
  onUseShop: (shopId: Id<"shops">) => void;
}) {
  const authorization = useShopAuthorization();
  const busy = connection.saving ? "shop-connect" : saving;
  return (
    <section className="space-y-5" aria-labelledby="shops-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="shops-title" className="text-xl font-semibold tracking-tight">
            Vos boutiques
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Choisissez la boutique de travail. Ses produits, générations et réglages restent
            associés à cette boutique.
          </p>
        </div>
        <ShopOnboarding
          connection={connection}
          shops={shops ?? []}
          disabled={shops === undefined || saving !== null}
        />
      </div>
      {connection.hasDraft && !connection.open && (
        <p role="status" className="text-sm text-muted-foreground">
          Un ajout est en cours. Vous pouvez le reprendre tant que cette page reste ouverte.
          <Button variant="ghost" size="sm" onClick={connection.reset}>
            Effacer ce brouillon
          </Button>
        </p>
      )}
      <ShopTable
        shops={shops}
        saving={busy}
        onCheckAuthorization={authorization.open}
        onUseShop={onUseShop}
      />
      {activeShop && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Synchroniser le catalogue</h3>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Mettre à jour les produits de {activeShop.domain} depuis Shopify.
            </p>
          </div>
          <Button variant="outline" disabled={syncing || busy !== null} onClick={onSync}>
            <BusyIcon busy={syncing} />
            {!syncing && <RefreshCw />}Synchroniser
          </Button>
        </div>
      )}
      <ShopAuthorizationDialog
        state={authorization.state}
        open={authorization.isOpen}
        onOpenChange={authorization.handleOpenChange}
        onClose={authorization.close}
        isAuthorizing={authorization.isAuthorizing}
        onAuthorize={() => void authorization.authorize()}
        onVerify={authorization.verify}
      />
    </section>
  );
}
