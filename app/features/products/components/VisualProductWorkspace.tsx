import {
  ArrowLeft,
  ExternalLink,
  LayoutGrid,
  Send,
  WandSparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { getReviewStatus, isReviewable } from "@/features/images/lib/review";
import { StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/lib/convex";
import { cn } from "@/lib/utils";
import type { GeneratedImagesGallery } from "./GeneratedImagesGallery";
import { GeneratedImagesGallery as GeneratedGallery } from "./GeneratedImagesGallery";
import type { VisualProductViewModel } from "../lib/visualProductWorkspace";
import { orderVisualReferences } from "../lib/visualReferenceOrder";
import {
  visualProductStatusLabels,
  visualProductStatusTones,
} from "../lib/visualProductWorkspace";

const OVERVIEW_VALUE = "overview";

export function VisualProductWorkspace({
  visualProducts,
  activeGroupId,
  overview,
  storeHandle,
  reviewingImageId,
  onSelect,
  onGenerate,
  onPublish,
  onReview,
  onRetouch,
  onDelete,
  onZoom,
}: {
  visualProducts: VisualProductViewModel[];
  activeGroupId: Id<"visualGroups"> | null;
  overview: ReactNode;
  storeHandle?: string | null;
  reviewingImageId: Parameters<
    typeof GeneratedImagesGallery
  >[0]["reviewingImageId"];
  onSelect: (groupId: Id<"visualGroups"> | null) => void;
  onGenerate: (groupId: Id<"visualGroups">) => void;
  onPublish: (groupId: Id<"visualGroups">) => void;
  onReview: Parameters<typeof GeneratedImagesGallery>[0]["onReview"];
  onRetouch: Parameters<typeof GeneratedImagesGallery>[0]["onRetouch"];
  onDelete: Parameters<typeof GeneratedImagesGallery>[0]["onDelete"];
  onZoom: Parameters<typeof GeneratedImagesGallery>[0]["onZoom"];
}) {
  const activeVisualProduct =
    visualProducts.find((item) => item.group._id === activeGroupId) ?? null;
  const publishedCount = visualProducts.filter(
    (item) => item.member || item.uploadedCount > 0,
  ).length;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-background"
      aria-label="Produit et déclinaisons"
    >
      <div className="border-b p-3 lg:hidden">
        <label
          htmlFor="visual-product-mobile-navigation"
          className="mb-1.5 block text-xs font-medium text-muted-foreground"
        >
          Espace affiché
        </label>
        <Select
          value={activeGroupId ?? OVERVIEW_VALUE}
          onValueChange={(value) =>
            onSelect(
              value === OVERVIEW_VALUE ? null : (value as Id<"visualGroups">),
            )
          }
        >
          <SelectTrigger
            id="visual-product-mobile-navigation"
            className="h-11 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OVERVIEW_VALUE}>Vue d’ensemble</SelectItem>
            {visualProducts.map((item) => (
              <SelectItem key={item.group._id} value={item.group._id}>
                {item.group.label} · {visualProductStatusLabels[item.status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="lg:grid lg:min-h-[38rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <VisualProductNavigation
          visualProducts={visualProducts}
          activeGroupId={activeGroupId}
          publishedCount={publishedCount}
          onSelect={onSelect}
        />

        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          {activeVisualProduct ? (
            <VisualProductDetail
              visualProduct={activeVisualProduct}
              storeHandle={storeHandle}
              reviewingImageId={reviewingImageId}
              onBack={() => onSelect(null)}
              onGenerate={() => onGenerate(activeVisualProduct.group._id)}
              onPublish={() => onPublish(activeVisualProduct.group._id)}
              onReview={onReview}
              onRetouch={onRetouch}
              onDelete={onDelete}
              onZoom={onZoom}
            />
          ) : overview}
        </div>
      </div>
    </section>
  );
}

function VisualProductNavigation({
  visualProducts,
  activeGroupId,
  publishedCount,
  onSelect,
}: {
  visualProducts: VisualProductViewModel[];
  activeGroupId: Id<"visualGroups"> | null;
  publishedCount: number;
  onSelect: (groupId: Id<"visualGroups"> | null) => void;
}) {
  return (
    <aside className="hidden border-r bg-muted/20 p-3 lg:block">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          activeGroupId === null && "bg-muted",
        )}
        aria-current={activeGroupId === null ? "page" : undefined}
        onClick={() => onSelect(null)}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border">
          <LayoutGrid className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Vue d’ensemble</span>
          <span className="block text-xs text-muted-foreground">
            {publishedCount}/{visualProducts.length} publiées
          </span>
        </span>
      </button>

      <div className="mb-2 mt-5 flex items-center justify-between px-3">
        <p className="text-xs font-medium text-muted-foreground">
          Déclinaisons
        </p>
        <Badge variant="outline">{visualProducts.length}</Badge>
      </div>

      <nav aria-label="Déclinaisons du produit" className="grid gap-1">
        {visualProducts.map((item) => {
          const selected = activeGroupId === item.group._id;
          return (
            <button
              key={item.group._id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-muted",
              )}
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelect(item.group._id)}
            >
              <span
                className="size-5 shrink-0 rounded-full border"
                style={{
                  background: item.group.swatchCss ?? "var(--muted)",
                }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {item.group.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {visualProductStatusLabels[item.status]}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function VisualProductDetail({
  visualProduct,
  storeHandle,
  reviewingImageId,
  onBack,
  onGenerate,
  onPublish,
  onReview,
  onRetouch,
  onDelete,
  onZoom,
}: {
  visualProduct: VisualProductViewModel;
  storeHandle?: string | null;
  reviewingImageId: Parameters<
    typeof GeneratedImagesGallery
  >[0]["reviewingImageId"];
  onBack: () => void;
  onGenerate: () => void;
  onPublish: () => void;
  onReview: Parameters<typeof GeneratedImagesGallery>[0]["onReview"];
  onRetouch: Parameters<typeof GeneratedImagesGallery>[0]["onRetouch"];
  onDelete: Parameters<typeof GeneratedImagesGallery>[0]["onDelete"];
  onZoom: Parameters<typeof GeneratedImagesGallery>[0]["onZoom"];
}) {
  const reviewableImages = visualProduct.images.filter(isReviewable);
  const generatedImages = visualProduct.images.filter((image) =>
    Boolean(image.storageUrl),
  );
  const generatingImages = visualProduct.images.filter(
    (image) =>
      !image.storageUrl &&
      (image.status === "queued" || image.status === "generating"),
  );
  const referenceImages = orderVisualReferences(
    visualProduct.group.references.filter((reference) => reference.confirmed),
  );
  const referenceLightboxItems = referenceImages.map((reference, index) => ({
    url: reference.referenceUrl,
    label: `Référence ${index + 1} · ${visualProduct.group.label}`,
  }));
  const shopifyAdminUrl = getChildProductAdminUrl(
    visualProduct.member?.shopifyProductId,
    storeHandle,
  );
  const displayedVariants = visualProduct.group.variants.slice(0, 6);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground lg:hidden"
        onClick={onBack}
      >
        <ArrowLeft data-icon="inline-start" />
        Toutes les déclinaisons
      </Button>

      <div className="flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="size-5 shrink-0 rounded-full border"
              style={{
                background: visualProduct.group.swatchCss ?? "var(--muted)",
              }}
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-muted-foreground">
              Déclinaison produit
            </p>
            <StateBadge state={visualProductStatusTones[visualProduct.status]}>
              {visualProductStatusLabels[visualProduct.status]}
            </StateBadge>
          </div>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
            {visualProduct.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {visualProduct.group.optionValues
              .map((option) => `${option.name} : ${option.value}`)
              .join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {shopifyAdminUrl ? (
            <Button variant="outline" asChild>
              <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Shopify
              </a>
            </Button>
          ) : null}
          <Button variant="outline" onClick={onGenerate}>
            <WandSparkles data-icon="inline-start" />
            Générer
          </Button>
          {visualProduct.publishableCount ? (
            <Button onClick={onPublish}>
              <Send data-icon="inline-start" />
              Publier
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 border-b py-4 sm:grid-cols-3">
        <Metric
          label="Variantes Shopify"
          value={visualProduct.group.variants.length}
        />
        <Metric label="Images générées" value={visualProduct.generatedCount} />
        <Metric
          label="Prêtes à publier"
          value={visualProduct.publishableCount}
        />
      </div>

      {displayedVariants.length ? (
        <div className="border-b py-4">
          <p className="text-xs font-medium text-muted-foreground">
            Variantes Shopify incluses
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {displayedVariants.map((variant) => (
              <Badge key={variant._id} variant="outline">
                {variant.title}
              </Badge>
            ))}
            {visualProduct.group.variants.length > displayedVariants.length ? (
              <Badge variant="outline">
                +
                {visualProduct.group.variants.length - displayedVariants.length}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <GeneratedGallery
          title={`Images · ${visualProduct.group.label}`}
          generatedGalleryImages={generatedImages}
          generatingGalleryImages={generatingImages}
          approvedCount={
            reviewableImages.filter(
              (image) => getReviewStatus(image) === "approved",
            ).length
          }
          pendingCount={
            reviewableImages.filter(
              (image) => getReviewStatus(image) === "pending",
            ).length
          }
          rejectedCount={
            reviewableImages.filter(
              (image) => getReviewStatus(image) === "rejected",
            ).length
          }
          reviewingImageId={reviewingImageId}
          onReview={onReview}
          onRetouch={onRetouch}
          onDelete={onDelete}
          onZoom={onZoom}
        />

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">Images de référence</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Utilisées ensemble pour les générations de cette déclinaison.
            </p>
          </div>
          {referenceImages.length ? (
            <>
              <div className="grid grid-cols-2 gap-px bg-border">
                {referenceImages.map((reference, index) => (
                  <button
                    key={reference._id}
                    type="button"
                    className="block aspect-square overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => onZoom(referenceLightboxItems, index)}
                  >
                    <img
                      src={reference.referenceUrl}
                      alt={`Référence ${index + 1} · ${visualProduct.group.label}`}
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {referenceImages.length} image
                {referenceImages.length === 1 ? "" : "s"} confirmée
                {referenceImages.length === 1 ? "" : "s"}
              </div>
            </>
          ) : (
            <div className="grid min-h-48 place-items-center p-4 text-center text-sm text-muted-foreground">
              Aucune référence confirmée.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function getChildProductAdminUrl(
  shopifyProductId: string | undefined,
  storeHandle: string | null | undefined,
) {
  const numericId = shopifyProductId?.split("/").pop();
  return storeHandle && numericId
    ? `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`
    : null;
}
