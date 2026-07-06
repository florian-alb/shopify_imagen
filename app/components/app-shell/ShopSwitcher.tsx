import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Loader2, Settings, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ShopOption } from "./types";

export function ShopSwitcher({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const shops = useQuery(api.shops.list) as ShopOption[] | undefined;
  const setActiveShop = useMutation(api.shops.setActive);
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const activeShop = shops?.find((shop) => shop.isActive) ?? shops?.[0];

  if (shops === undefined) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }

  if (!shops.length || !activeShop) {
    return (
      <Button
        variant="outline"
        className="h-auto w-full justify-start gap-3 rounded-lg border-border bg-background p-3"
        asChild
      >
        <Link to="/settings" onClick={onNavigate}>
          <ShopIcon />
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">
              Connecter Shopify
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Aucune boutique active
            </span>
          </span>
        </Link>
      </Button>
    );
  }

  const activeValue = activeShop._id ?? "env";
  const activeLabel = shopDisplayName(activeShop);

  async function changeShop(value: string) {
    if (value === "settings") {
      onNavigate?.();
      void navigate({ to: "/settings" });
      return;
    }

    if (value === "env" || value === activeValue) return;

    setSwitching(true);
    try {
      await setActiveShop({ shopId: value as Id<"shops"> });
      toast.success("Boutique active changee");
    } catch (error) {
      toast.error("Impossible de changer de boutique", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "rounded-lg border bg-card p-3"
          : "rounded-lg border bg-card p-3"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ShopIcon loading={switching} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activeLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeShop.domain ||
                activeShop.storeHandle ||
                `${shops.length} boutiques`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          asChild
        >
          <Link
            to="/settings"
            onClick={onNavigate}
            aria-label="Parametres boutique"
          >
            <Settings className="size-4" />
          </Link>
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
          >
            {switching ? "Changement..." : "Changer"}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Boutiques</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {shops.map((shop) => (
            <DropdownMenuItem
              key={shop._id ?? shop.domain}
              disabled={!shop._id || switching}
              onSelect={() =>
                shop._id ? void changeShop(shop._id) : undefined
              }
            >
              <span className="min-w-0">
                <span className="block truncate">{shopDisplayName(shop)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shop.domain || shop.storeHandle}
                </span>
              </span>
              {shop._id === activeShop._id ? (
                <Badge variant="outline" className="ml-auto">
                  Active
                </Badge>
              ) : null}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void changeShop("settings")}>
            Gerer les boutiques
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ShopIcon({ loading = false }: { loading?: boolean }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Store className="size-4" />
      )}
    </span>
  );
}

function shopDisplayName(shop: ShopOption) {
  return shop.name || shop.storeHandle || shop.domain;
}
