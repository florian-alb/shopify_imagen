import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ImageIcon, WandSparkles, X } from "lucide-react";
import { StateBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { ProductSearch } from "@/lib/productFilters";
import { generationStateTone, productGenerationStateLabels, productPublishStateLabels, productReviewStateLabels, publishStateTone, reviewStateTone, shopifyStatusLabel } from "@/lib/status";
import type { ProductListItem } from "../types";
import { productActionLabels, productActionSearch } from "../lib/productWorkspaceSearch";

export function ProductQuickView({ product, search, onClose, onGenerate }: {
  product: ProductListItem;
  search: ProductSearch;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [product._id]);
  const image = product.featuredImageDisplayUrl ?? product.featuredImageUrl;

  return (
    <aside className="studio-inspector min-w-0 animate-in fade-in-0 slide-in-from-right-2 duration-200 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto"
      aria-label={`Aperçu de ${product.title}`} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Fiche produit</span>
        <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer l’aperçu"><X /></Button>
      </div>
      <div className="grid aspect-square max-h-64 place-items-center overflow-hidden rounded-lg bg-muted">
        {image ? <img src={image} alt={product.title} className="size-full object-contain" /> : <ImageIcon className="size-8 text-muted-foreground" />}
      </div>
      <h2 className="mt-5 break-words text-lg font-semibold leading-snug tracking-tight">{product.title}</h2>
      <p className="mt-1 break-all text-xs text-muted-foreground">{product.handle}</p>
      <dl className="mt-5 divide-y divide-border text-xs [&>div]:flex [&>div]:flex-wrap [&>div]:items-center [&>div]:justify-between [&>div]:gap-2 [&>div]:py-3 [&_dt]:text-muted-foreground">
        <div><dt>Génération</dt><dd><StateBadge state={generationStateTone(product.generationState)}>{productGenerationStateLabels[product.generationState]}</StateBadge></dd></div>
        <div><dt>Vérification</dt><dd><StateBadge state={reviewStateTone(product.reviewState)}>{productReviewStateLabels[product.reviewState]}</StateBadge></dd></div>
        <div><dt>Publication</dt><dd><StateBadge state={publishStateTone(product.publishState)}>{productPublishStateLabels[product.publishState]}</StateBadge></dd></div>
        <div><dt>Shopify</dt><dd>{shopifyStatusLabel(product.shopifyStatus)} · {product.shopifyImageCount} image{product.shopifyImageCount === 1 ? "" : "s"}</dd></div>
        <div><dt>Visuels générés</dt><dd>{product.generatedImageCount ?? 0}</dd></div>
        {!!product.pendingReviewCount && <div><dt>À vérifier</dt><dd>{product.pendingReviewCount}</dd></div>}
        {!!product.failedImageCount && <div><dt>En échec</dt><dd className="text-destructive">{product.failedImageCount}</dd></div>}
        {product.productType && <div><dt>Catégorie</dt><dd className="break-words">{product.productType}</dd></div>}
        {product.vendor && <div><dt>Fournisseur</dt><dd className="break-words">{product.vendor}</dd></div>}
      </dl>
      <div className="mt-5 flex flex-col gap-2">
        {product.primaryAction === "generate" ? <Button onClick={onGenerate}><WandSparkles />Générer des visuels</Button>
          : <Button asChild><Link to="/products/$productId" params={{ productId: product._id }} search={productActionSearch(search, product.primaryAction)}>
            {product.primaryAction === "review" ? `Vérifier ${product.pendingReviewCount ?? "les"} images` : product.primaryAction === "push" ? "Préparer la publication" : productActionLabels[product.primaryAction]}<ArrowUpRight />
          </Link></Button>}
        <Button variant="outline" asChild><Link to="/products/$productId" params={{ productId: product._id }} search={search}>Ouvrir l’espace produit</Link></Button>
        {product.primaryAction !== "generate" && <Button variant="ghost" onClick={onGenerate}><WandSparkles />Générer d’autres visuels</Button>}
      </div>
    </aside>
  );
}
