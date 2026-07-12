import { Link } from "@tanstack/react-router";
import { LockKeyhole, WandSparkles } from "lucide-react";

import { StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ProductSearch } from "@/lib/productFilters";
import {
  generationStateTone,
  primaryActionTone,
  productGenerationStateLabels,
  productPrimaryActionLabels,
  productPublishStateLabels,
  productReviewStateLabels,
  publishStateTone,
  reviewStateTone,
  shopifyStatusLabel,
} from "@/lib/status";

import { bulkTransformStatusLabel } from "../lib/bulkImageTransformViewModel";
import type { BulkProductLock, ProductListItem } from "../types";

export function ProductTableRow({
  product,
  search,
  selected,
  bulkLock,
  onToggle,
  onGenerateOne,
}: {
  product: ProductListItem;
  search: ProductSearch;
  selected: boolean;
  bulkLock?: BulkProductLock;
  onToggle: () => void;
  onGenerateOne: () => void;
}) {
  const image = product.featuredImageDisplayUrl ?? product.featuredImageUrl;

  return (
    <TableRow data-state={selected ? "selected" : undefined} className="group">
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Selectionner ${product.title}`}
        />
      </TableCell>
      <TableCell className="min-w-[20rem]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/products/$productId"
            params={{ productId: product._id }}
            search={search}
            className="block size-12 shrink-0 overflow-hidden rounded-[calc(var(--radius)+0.05rem)] bg-muted [&>img]:size-full [&>img]:object-cover"
          >
            {image ? (
              <img src={image} alt={product.title} />
            ) : (
              <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
                Sans image
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link
              to="/products/$productId"
              params={{ productId: product._id }}
              search={search}
              className="block min-w-0 hover:text-primary"
            >
              <span className="block truncate font-medium">{product.title}</span>
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-mono">{product.handle}</span>
              <span className="text-white/20">/</span>
              <span className="truncate">
                {product.productType || "Sans categorie"}
              </span>
              {bulkLock ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-400/25 bg-amber-400/10 text-amber-200"
                  title="Ce produit est réservé par un bulk non terminé."
                >
                  <LockKeyhole className="size-3" />
                  Bulk · {bulkTransformStatusLabel(bulkLock.status)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StateBadge state={primaryActionTone(product.primaryAction)}>
          {productPrimaryActionLabels[product.primaryAction]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={generationStateTone(product.generationState)}>
          {productGenerationStateLabels[product.generationState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={reviewStateTone(product.reviewState)}>
          {productReviewStateLabels[product.reviewState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <StateBadge state={publishStateTone(product.publishState)}>
          {productPublishStateLabels[product.publishState]}
        </StateBadge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="border-border bg-muted">
            {product.generatedImageCount ?? 0} gen.
          </Badge>
          {product.failedImageCount ? (
            <Badge
              variant="outline"
              className="border-red-400/25 bg-red-400/10 text-red-200"
            >
              {product.failedImageCount} err.
            </Badge>
          ) : null}
          {product.pendingReviewCount ? (
            <Badge
              variant="outline"
              className="border-amber-400/25 bg-amber-400/10 text-amber-200"
            >
              {product.pendingReviewCount} review
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {product.shopifyStatus ? (
            <Badge
              variant="outline"
              className="border-border bg-muted"
            >
              {shopifyStatusLabel(product.shopifyStatus)}
            </Badge>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {product.shopifyImageCount} images
          </p>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onGenerateOne}>
          <WandSparkles data-icon="inline-start" />
          Generer
        </Button>
      </TableCell>
    </TableRow>
  );
}
