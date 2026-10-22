import { useState } from "react";
import { Send, Images } from "lucide-react";
import type { GalleryReorder } from "@/components/common/Gallery/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Doc, Id } from "@/lib/convex";
import { GeneratedImagesGallery } from "./GeneratedImagesGallery";
import { ShopifyImagesGallery } from "./ShopifyImagesGallery";
import { matchesProductImageView, pendingReviewImages, productImageViewLabels } from "../lib/productImageViews";
import { productImageViews, type ProductImageView } from "../lib/productWorkspaceSearch";
import type { ShopifyGalleryImage } from "../types";

export function ProductImagesSection({ images, readyImages, filter, onFilterChange, scopeLabel, destination,
  shopifyImages, shopifyDescription, shopifyReorder, reviewingImageId, reviewingAll,
  onReview, onApproveAll, onRetouch, onDelete, onZoom, onPublish, onReferences }: {
  images: Doc<"generatedImages">[];
  readyImages: Doc<"generatedImages">[];
  filter: ProductImageView;
  onFilterChange: (filter: ProductImageView) => void;
  scopeLabel: string;
  destination: string;
  shopifyImages: ShopifyGalleryImage[];
  shopifyDescription?: string;
  shopifyReorder?: GalleryReorder;
  reviewingImageId: Id<"generatedImages"> | null;
  reviewingAll: boolean;
  onReview: (image: Doc<"generatedImages">, reviewStatus: "approved" | "rejected") => void;
  onApproveAll: (images: Doc<"generatedImages">[]) => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onDelete: (image: Doc<"generatedImages">) => void;
  onZoom: Parameters<typeof ShopifyImagesGallery>[0]["onZoom"];
  onPublish: () => void;
  onReferences: () => void;
}) {
  const [compare, setCompare] = useState(false);
  const visible = images.filter(image => matchesProductImageView(image, filter));
  const pending = pendingReviewImages(visible);
  const newImages = readyImages.filter(image => image.status !== "uploaded");
  const republishCount = readyImages.length - newImages.length;
  const counts = Object.fromEntries(productImageViews.map(view => [view, images.filter(image => matchesProductImageView(image, view)).length]));
  // Readiness also respects the product's visual-group publication rules.
  counts.ready = newImages.length;
  const displayed = filter === "ready" ? newImages : visible;
  return <section aria-label="Images du produit" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="w-full sm:hidden">
        <label htmlFor="product-image-view" className="mb-2 block text-xs font-medium">Afficher les images</label>
        <Select value={filter} onValueChange={value => onFilterChange(value as ProductImageView)}>
          <SelectTrigger id="product-image-view" className="h-11 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{productImageViews.map(view => <SelectItem key={view} value={view}>{productImageViewLabels[view]} · {counts[view]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="hidden flex-wrap gap-1 sm:flex" role="group" aria-label="Filtrer les images">
        {productImageViews.map(view => <Button key={view} size="sm" variant={view === filter ? "secondary" : "ghost"}
          aria-pressed={view === filter} onClick={() => onFilterChange(view)}>{productImageViewLabels[view]} <span className="tabular-nums text-muted-foreground">{counts[view]}</span></Button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground" role="status">{displayed.length} image{displayed.length === 1 ? "" : "s"} affichée{displayed.length === 1 ? "" : "s"} · {scopeLabel}</p>
      <Button variant="outline" size="sm" aria-expanded={compare} aria-controls="product-reference-comparison" onClick={() => setCompare(value => !value)}>
        <Images />{compare ? "Masquer les références" : "Comparer avec Shopify"}
      </Button>
    </div>
    <div className={compare ? "grid min-w-0 items-start gap-4 xl:grid-cols-2" : "min-w-0"}>
      <GeneratedImagesGallery title={productImageViewLabels[filter]}
        generatedGalleryImages={displayed.filter(image => image.storageUrl)}
        generatingGalleryImages={displayed.filter(image => !image.storageUrl && ["queued", "generating", "postprocessing"].includes(image.status))}
        unavailableGalleryImages={displayed.filter(image => !image.storageUrl && !["queued", "generating", "postprocessing"].includes(image.status))}
        pendingCount={pending.length}
        reviewingImageId={reviewingImageId} reviewingAll={reviewingAll}
        onReview={onReview} onApproveAll={() => onApproveAll(pending)} onRetouch={onRetouch} onDelete={onDelete} onZoom={onZoom}
        emptyText={filter === "pending" ? "Aucune image en attente de vérification dans ce périmètre." : filter === "ready" ? "Aucune nouvelle image à publier. Les images déjà envoyées restent accessibles dans Publiées." : "Aucune image dans cette vue."}
      />
      {compare && <div id="product-reference-comparison" className="min-w-0">
        <ShopifyImagesGallery shopifyImages={shopifyImages} generatedImages={images} description={shopifyDescription}
          onZoom={onZoom} onRetouch={onRetouch} reorder={shopifyReorder} />
      </div>}
    </div>
    {!images.length && <Button variant="outline" onClick={onReferences}>Préparer les références et déclinaisons</Button>}
    <div className="sticky-actions flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg max-sm:static sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{newImages.length} nouvelle{newImages.length === 1 ? "" : "s"} image{newImages.length === 1 ? "" : "s"} à publier{republishCount ? ` · ${republishCount} déjà publiée${republishCount === 1 ? "" : "s"}` : ""}</p>
        <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{scopeLabel} → {destination}. Le filtre d’affichage ne limite pas cette sélection.</p>
      </div>
      <Button className="max-sm:min-h-11" disabled={!readyImages.length} onClick={onPublish}><Send />{!newImages.length && republishCount ? "Préparer une republication" : "Préparer la publication"}</Button>
    </div>
  </section>;
}
