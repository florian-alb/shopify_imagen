import { Link } from "@tanstack/react-router";
import { Eye, ImageIcon, LockKeyhole, WandSparkles } from "lucide-react";
import { StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ProductSearch } from "@/lib/productFilters";
import { primaryActionTone, productPrimaryActionLabels } from "@/lib/status";
import { bulkTransformStatusLabel } from "../lib/bulkImageTransformViewModel";
import { bulkReorderStatusLabel } from "../lib/bulkImageReorderViewModel";
import type { BulkProductLock, ProductListItem } from "../types";
import { productActionLabels, productActionSearch } from "../lib/productWorkspaceSearch";

export function ProductTableRow({ product, search, selected, inspecting, bulkLock, onToggle, onGenerateOne, onInspect }: {
  product: ProductListItem;
  search: ProductSearch;
  selected: boolean;
  inspecting: boolean;
  bulkLock?: BulkProductLock;
  onToggle: () => void;
  onGenerateOne: () => void;
  onInspect: () => void;
}) {
  const image = product.featuredImageDisplayUrl ?? product.featuredImageUrl;
  const count = product.generatedImageCount ?? 0;
  return (
    <TableRow data-state={selected || inspecting ? "selected" : undefined}>
      <TableCell className="w-10 !pl-3 !pr-0 sm:!pl-4"><Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Sélectionner ${product.title}`} /></TableCell>
      <TableCell className="!whitespace-normal">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onInspect} aria-label={`Aperçu de ${product.title}`} aria-expanded={inspecting}
            className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-14">
            {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}
          </button>
          <div className="min-w-0">
            <Link to="/products/$productId" params={{ productId: product._id }} search={search} className="line-clamp-2 font-medium leading-snug hover:text-primary">{product.title}</Link>
            <p className="mt-1 text-xs text-muted-foreground">{product.productType || "Sans catégorie"}</p>
            <div className="mt-2 @[30rem]:hidden"><StateBadge state={primaryActionTone(product.primaryAction)}>{productPrimaryActionLabels[product.primaryAction]}</StateBadge></div>
            {bulkLock && <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><LockKeyhole className="size-3 shrink-0" />
              {bulkLock.operation === "reorder_media"
                ? `Réorganisation · ${bulkReorderStatusLabel(bulkLock.status as Parameters<typeof bulkReorderStatusLabel>[0])}`
                : `Miroir · ${bulkTransformStatusLabel(bulkLock.status as Parameters<typeof bulkTransformStatusLabel>[0])}`}
            </p>}
            {!!product.failedImageCount && <p className="mt-1 text-xs text-destructive">{product.failedImageCount} image{product.failedImageCount === 1 ? "" : "s"} en échec</p>}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden tabular-nums @[44rem]:table-cell"><p>{count} visuel{count === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-muted-foreground">{product.shopifyImageCount} sur Shopify</p></TableCell>
      <TableCell className="hidden @[30rem]:table-cell"><StateBadge state={primaryActionTone(product.primaryAction)}>{productPrimaryActionLabels[product.primaryAction]}</StateBadge>
        {!!product.pendingReviewCount && <p className="mt-1.5 text-xs text-muted-foreground">{product.pendingReviewCount} à vérifier</p>}
      </TableCell>
      <TableCell className="!pl-0 text-right"><div className="flex flex-col items-end justify-end gap-1 @[52rem]:flex-row">
        <Button variant="ghost" size="icon-sm" onClick={onInspect} aria-label={`Afficher les détails de ${product.title}`} aria-expanded={inspecting}><Eye /></Button>
        <div>
          {product.primaryAction === "generate" ? <Button variant="outline" size="sm" onClick={onGenerateOne}><WandSparkles />Générer</Button>
            : <Button variant="outline" size="sm" asChild><Link to="/products/$productId" params={{ productId: product._id }} search={productActionSearch(search, product.primaryAction)}>{productActionLabels[product.primaryAction]}</Link></Button>}
        </div>
      </div></TableCell>
    </TableRow>
  );
}
