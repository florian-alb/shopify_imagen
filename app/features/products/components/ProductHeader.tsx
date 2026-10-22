import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, ListChecks, MoreHorizontal, RefreshCw, Send, WandSparkles, CheckCheck } from "lucide-react";
import { BusyIcon, StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { validateProductSearch } from "@/lib/productFilters";
import { primaryActionTone, productPrimaryActionLabels, type ProductPrimaryAction } from "@/lib/status";
import type { Doc } from "@/lib/convex";
import type { ProductWorkspaceSearch } from "../lib/productWorkspaceSearch";
import type { ProductNavigation } from "../types";
import type { Ref } from "react";
import { ProductNavigationButton } from "./ProductNavigationButton";

export function ProductHeader({ productId, product, search, productNavigation, primaryAction,
  hasProductJobs, shopifyAdminUrl, readyImagesCount, publishedImagesCount, pendingCount, scopeLabel, destination, titleRef,
  syncing, actionsDisabled, onSync, onGenerate, onPublish, onReview }: {
  productId: string;
  product: Doc<"products">;
  search: ProductWorkspaceSearch;
  productNavigation: ProductNavigation | undefined;
  primaryAction: ProductPrimaryAction;
  hasProductJobs: boolean;
  shopifyAdminUrl: string | null;
  readyImagesCount: number;
  publishedImagesCount: number;
  titleRef: Ref<HTMLHeadingElement>;
  pendingCount: number;
  scopeLabel: string;
  destination: string;
  syncing: boolean;
  actionsDisabled: boolean;
  onSync: () => void;
  onGenerate: () => void;
  onPublish: () => void;
  onReview: () => void;
}) {
  return <header className="mb-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="/products" search={validateProductSearch(search)}><ArrowLeft />Retour aux résultats</Link>
      </Button>
      <div className="flex items-center gap-2">
        <ProductNavigationButton direction="previous" product={productNavigation?.previous} search={search} />
        <span className="text-xs tabular-nums text-muted-foreground">{productNavigation?.position ? `${productNavigation.position} / ${productNavigation.total}` : `${productNavigation?.total ?? 0} produits`}</span>
        <ProductNavigationButton direction="next" product={productNavigation?.next} search={search} />
      </div>
    </div>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0 flex-1 basis-72">
        <p className="mb-2 text-xs text-muted-foreground">{destination} · {product.productType || "Sans catégorie"}</p>
        <h1 ref={titleRef} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight outline-none sm:text-3xl">{product.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StateBadge state={primaryActionTone(primaryAction)}>{productPrimaryActionLabels[primaryAction]}</StateBadge>
          <span className="text-xs text-muted-foreground">{scopeLabel}</span>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 max-sm:[&>button]:min-h-11 max-sm:[&>button]:px-3 max-sm:[&>button:not(:last-child)_svg]:hidden lg:w-auto">
        {pendingCount > 0 && <Button onClick={onReview} disabled={actionsDisabled}><CheckCheck />Vérifier {pendingCount}</Button>}
        <Button variant={pendingCount || readyImagesCount ? "outline" : "default"} onClick={onGenerate} disabled={actionsDisabled}><WandSparkles />Générer</Button>
        {(readyImagesCount > 0 || publishedImagesCount > 0) && <Button variant={pendingCount || !readyImagesCount ? "outline" : "default"} onClick={onPublish} disabled={actionsDisabled}><Send />{readyImagesCount ? `Publier ${readyImagesCount}` : "Republier"}</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Autres actions du produit"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem disabled={syncing} onSelect={onSync}><BusyIcon busy={syncing} />{!syncing && <RefreshCw />}Synchroniser le produit</DropdownMenuItem>
            {hasProductJobs && <DropdownMenuItem asChild><Link to="/jobs" search={{ productId }}><ListChecks />Voir les générations</Link></DropdownMenuItem>}
            {shopifyAdminUrl && <DropdownMenuItem asChild><a href={shopifyAdminUrl} target="_blank" rel="noreferrer"><ExternalLink />Ouvrir dans Shopify</a></DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>;
}
