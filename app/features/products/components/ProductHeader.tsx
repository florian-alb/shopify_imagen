import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  ListChecks,
  RefreshCw,
  Send,
  WandSparkles,
} from "lucide-react";

import { BusyIcon, StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
  type ProductGenerationState,
  type ProductPrimaryAction,
  type ProductPublishState,
  type ProductReviewState,
} from "@/lib/status";
import type { Doc } from "@/lib/convex";

import { ProductNavigationButton } from "./ProductNavigationButton";
import type { ProductNavigation } from "../types";

export function ProductHeader({
  productId,
  product,
  search,
  productNavigation,
  primaryAction,
  generationState,
  reviewState,
  publishState,
  hasProductJobs,
  shopifyAdminUrl,
  readyImagesCount,
  syncing,
  onSync,
  onGenerate,
  onPublish,
}: {
  productId: string;
  product: Doc<"products">;
  search: ProductSearch;
  productNavigation: ProductNavigation | undefined;
  primaryAction: ProductPrimaryAction;
  generationState: ProductGenerationState;
  reviewState: ProductReviewState;
  publishState: ProductPublishState;
  hasProductJobs: boolean;
  shopifyAdminUrl: string | null;
  readyImagesCount: number;
  syncing: boolean;
  onSync: () => void;
  onGenerate: () => void;
  onPublish: () => void;
}) {
  return (
    <header className="mb-4 flex flex-col gap-4 border-b border-white/10 pb-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="-ml-2 text-muted-foreground"
                >
                  <Link to="/products" search={search}>
                    <ArrowLeft data-icon="inline-start" />
                    Produits
                  </Link>
                </Button>
              </BreadcrumbItem>
              <BreadcrumbItem className="sr-only">
                <BreadcrumbPage>{product.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <StateBadge state={primaryActionTone(primaryAction)}>
            {productPrimaryActionLabels[primaryAction]}
          </StateBadge>
          <StateBadge state={generationStateTone(generationState)}>
            {productGenerationStateLabels[generationState]}
          </StateBadge>
          <StateBadge state={reviewStateTone(reviewState)}>
            {productReviewStateLabels[reviewState]}
          </StateBadge>
          <StateBadge state={publishStateTone(publishState)}>
            {productPublishStateLabels[publishState]}
          </StateBadge>
          <Badge variant="outline">
            {product.productType || "Sans categorie"}
          </Badge>
          {product.shopifyStatus ? (
            <Badge variant="outline">
              {shopifyStatusLabel(product.shopifyStatus)}
            </Badge>
          ) : null}
          {product.vendor ? (
            <Badge variant="outline">{product.vendor}</Badge>
          ) : null}
        </div>
        <h1 className="truncate text-2xl font-semibold sm:text-3xl">
          {product.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProductNavigationButton
            direction="previous"
            product={productNavigation?.previous}
            search={search}
          />
          <span className="text-xs text-muted-foreground">
            {productNavigation?.position
              ? `${productNavigation.position} / ${productNavigation.total}`
              : `${productNavigation?.total ?? 0} products`}
          </span>
          <ProductNavigationButton
            direction="next"
            product={productNavigation?.next}
            search={search}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasProductJobs ? (
          <Button size="lg" variant="outline" asChild>
            <Link to="/jobs" search={{ productId }}>
              <ListChecks data-icon="inline-start" />
              Jobs
            </Link>
          </Button>
        ) : null}
        <Button
          size="lg"
          variant="outline"
          onClick={() => void onSync()}
          disabled={syncing}
        >
          <BusyIcon busy={syncing} />
          {!syncing ? <RefreshCw data-icon="inline-start" /> : null}
          Sync
        </Button>
        {shopifyAdminUrl ? (
          <Button size="lg" variant="outline" asChild>
            <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              Shopify
            </a>
          </Button>
        ) : null}
        <Button size="lg" onClick={onGenerate}>
          <WandSparkles data-icon="inline-start" />
          Generer
        </Button>
        {readyImagesCount ? (
          <Button size="lg" disabled={!readyImagesCount} onClick={onPublish}>
            <Send data-icon="inline-start" />
            Publier
          </Button>
        ) : null}
      </div>
    </header>
  );
}
