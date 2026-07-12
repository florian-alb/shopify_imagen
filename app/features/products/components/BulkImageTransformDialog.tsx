import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FlipHorizontal2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

import { BusyIcon } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  BulkTransformDetails,
  BulkTransformSelectionOptions,
} from "../hooks/useBulkImageTransform";
import {
  bulkTransformCanCancel,
  bulkTransformCanPublish,
  bulkTransformCanRetry,
  bulkTransformImagePositionsLabel,
  bulkTransformIsTerminal,
  bulkTransformProgress,
  bulkTransformReadyToPublishCount,
  bulkTransformStatusLabel,
  MAX_BULK_TRANSFORM_PRODUCTS,
} from "../lib/bulkImageTransformViewModel";

export function BulkImageTransformDialog({
  open,
  isNewFlow,
  selectedProductCount,
  selectionOptions,
  selectionOptionsLoading,
  selectedImagePositions,
  details,
  starting,
  retrying,
  dismissing,
  busy,
  commandError,
  onOpenChange,
  onStart,
  onRequestCancel,
  onRequestPublish,
  onRetry,
  onClose,
  onRequestDismiss,
  onToggleImagePosition,
  onSelectAllImagePositions,
  onClearImagePositions,
}: {
  open: boolean;
  isNewFlow: boolean;
  selectedProductCount: number;
  selectionOptions: BulkTransformSelectionOptions | undefined;
  selectionOptionsLoading: boolean;
  selectedImagePositions: number[];
  details: BulkTransformDetails | null | undefined;
  starting: boolean;
  retrying: boolean;
  dismissing: boolean;
  busy: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
  onRequestCancel: () => void;
  onRequestPublish: () => void;
  onRetry: () => void;
  onClose: () => void;
  onRequestDismiss: () => void;
  onToggleImagePosition: (position: number) => void;
  onSelectAllImagePositions: () => void;
  onClearImagePositions: () => void;
}) {
  const job = details?.job;
  const loadingExisting = !isNewFlow && details === undefined;
  const progress = job ? bulkTransformProgress(job) : null;
  const terminal = job ? bulkTransformIsTerminal(job.status) : false;
  const canRetry = job ? bulkTransformCanRetry(job) : false;
  const failures = job
    ? job.transformFailedItems + job.publishFailedItems + job.conflictItems
    : 0;
  const readyToPublish = job ? bulkTransformReadyToPublishCount(job) : 0;
  const assetsUnavailable = Boolean(
    details?.job.assetsCleanupStartedAt || details?.job.assetsCleanedAt,
  );
  const selectionTooLarge = selectedProductCount > MAX_BULK_TRANSFORM_PRODUCTS;
  const previewItems = assetsUnavailable
    ? []
    : (details?.previewItems.filter((item) => item.outputUrl) ?? []);
  const failedItems = [
    ...(details?.productErrors ?? []),
    ...(details?.errorItems ?? []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlipHorizontal2 className="size-5" />
            Miroir horizontal en masse
          </DialogTitle>
          <DialogDescription>
            Prépare des versions miroir, permet de les contrôler, puis remplace
            les fichiers Shopify en conservant leurs identifiants et leur ordre.
          </DialogDescription>
        </DialogHeader>

        {commandError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Action impossible</AlertTitle>
            <AlertDescription>{commandError}</AlertDescription>
          </Alert>
        ) : null}

        {isNewFlow ? (
          <div className="grid gap-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="font-medium">
                {selectedProductCount} produit
                {selectedProductCount === 1 ? "" : "s"} sélectionné
                {selectedProductCount === 1 ? "" : "s"}
              </p>
            </div>
            {!selectionTooLarge ? (
              <section
                className="grid gap-3"
                aria-labelledby="bulk-image-positions"
              >
                {selectionOptions?.unavailableProductCount ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Sélection à actualiser</AlertTitle>
                    <AlertDescription>
                      {selectionOptions.unavailableProductCount} produit
                      {selectionOptions.unavailableProductCount === 1
                        ? ""
                        : "s"}{" "}
                      ne{" "}
                      {selectionOptions.unavailableProductCount === 1
                        ? "fait"
                        : "font"}{" "}
                      plus partie de la boutique active. Ferme ce dialogue puis
                      actualise ta sélection.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {selectionOptions?.lockedProducts.length ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Produits déjà engagés dans un bulk</AlertTitle>
                    <AlertDescription>
                      {selectionOptions.lockedProducts.length} produit
                      {selectionOptions.lockedProducts.length === 1
                        ? " est déjà réservé"
                        : "s sont déjà réservés"}{" "}
                      par un bulk non terminé :{" "}
                      {selectionOptions.lockedProducts
                        .slice(0, 3)
                        .map((product) => product.productTitle)
                        .join(", ")}
                      {selectionOptions.lockedProducts.length > 3 ? "…" : ""}.
                      Termine ou abandonne ces bulks, ou retire ces produits de
                      la sélection.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="bulk-image-positions" className="font-medium">
                      Images à retoucher
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      La position est appliquée à chaque produit qui possède
                      cette image.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        busy ||
                        selectionOptionsLoading ||
                        !selectionOptions?.positions.length
                      }
                      onClick={onSelectAllImagePositions}
                    >
                      Tout cocher
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={
                        busy ||
                        selectionOptionsLoading ||
                        !selectionOptions?.positions.length
                      }
                      onClick={onClearImagePositions}
                    >
                      Tout décocher
                    </Button>
                  </div>
                </div>
                {selectionOptionsLoading ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground">
                    <BusyIcon busy />
                    Lecture des images sélectionnées…
                  </div>
                ) : selectionOptions?.positions.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectionOptions.positions.map((option) => {
                      const checked = selectedImagePositions.includes(
                        option.position,
                      );
                      return (
                        <label
                          key={option.position}
                          className={cn(
                            "grid cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-lg border bg-card p-3 transition-colors",
                            checked && "border-primary/60 bg-primary/5",
                          )}
                        >
                          <Checkbox
                            className="mt-1"
                            checked={checked}
                            disabled={busy}
                            onCheckedChange={() =>
                              onToggleImagePosition(option.position)
                            }
                            aria-label={`Sélectionner l’image numéro ${option.position}`}
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-medium">
                                Image n°{option.position}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {option.productCount}/{selectedProductCount}{" "}
                                produit
                                {option.productCount === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span className="mt-2 flex -space-x-2">
                              {option.previews.map((preview) => (
                                <img
                                  key={preview.productId}
                                  src={preview.url}
                                  alt={`Image n°${option.position} de ${preview.productTitle}`}
                                  loading="lazy"
                                  className="size-12 rounded-md border-2 border-card bg-muted object-contain"
                                />
                              ))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Aucune image sélectionnable</AlertTitle>
                    <AlertDescription>
                      Synchronise le catalogue Shopify ou choisis d’autres
                      produits avant de lancer ce bulk.
                    </AlertDescription>
                  </Alert>
                )}
                {!selectionOptionsLoading &&
                selectionOptions?.positions.length &&
                !selectedImagePositions.length ? (
                  <p className="text-sm font-medium text-destructive">
                    Coche au moins une position d’image.
                  </p>
                ) : null}
              </section>
            ) : null}
            {selectionTooLarge ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Sélection trop grande</AlertTitle>
                <AlertDescription>
                  Un bulk accepte au maximum {MAX_BULK_TRANSFORM_PRODUCTS}
                  produits. Scinde cette sélection en plusieurs traitements.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : loadingExisting ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <BusyIcon busy />
            Chargement du bulk…
          </div>
        ) : !job ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Bulk introuvable</AlertTitle>
            <AlertDescription>
              Ce résultat n’est plus disponible pour la boutique active.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium" aria-live="polite">
                  {bulkTransformStatusLabel(job.status)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {progress?.completed ?? 0} / {progress?.total ?? 0}
                </span>
              </div>
              <Progress
                value={progress?.percent ?? 0}
                aria-label={
                  progress?.phase === "seed"
                    ? "Progression de l’inventaire des produits Shopify"
                    : progress?.phase === "publish"
                      ? "Progression du remplacement Shopify"
                      : "Progression de la préparation des miroirs"
                }
                aria-valuetext={`${progress?.completed ?? 0} sur ${progress?.total ?? 0} ${progress?.phase === "seed" ? "produits" : "images"}`}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{job.transformedItems} préparées</span>
                <span>{job.publishedItems} remplacées</span>
                <span>
                  {bulkTransformImagePositionsLabel(job.selectedImagePositions)}
                </span>
                {job.skippedItems ? (
                  <span>{job.skippedItems} ignorées</span>
                ) : null}
                {job.unsupportedItems ? (
                  <span>{job.unsupportedItems} formats ignorés</span>
                ) : null}
                {job.seedFailedProducts ? (
                  <span>
                    {job.seedFailedProducts} produit
                    {job.seedFailedProducts === 1 ? "" : "s"} illisible
                    {job.seedFailedProducts === 1 ? "" : "s"}
                  </span>
                ) : null}
                {failures ? <span>{failures} en erreur ou conflit</span> : null}
              </div>
            </div>

            {job.status === "completed" ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Remplacement terminé</AlertTitle>
                <AlertDescription>
                  {job.publishedItems} image
                  {job.publishedItems === 1 ? "" : "s"} mise
                  {job.publishedItems === 1 ? "" : "s"} à jour sur Shopify.
                </AlertDescription>
              </Alert>
            ) : null}

            {failures ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Intervention nécessaire</AlertTitle>
                <AlertDescription>
                  Les conflits correspondent à des images modifiées après la
                  préparation : elles n’ont pas été écrasées.
                </AlertDescription>
              </Alert>
            ) : null}

            {job.seedFailedProducts ||
            job.skippedItems ||
            job.unsupportedItems ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Éléments non traités</AlertTitle>
                <AlertDescription>
                  Les produits illisibles, les images Shopify indisponibles et
                  les animations ont été laissés intacts. Ils ne sont pas inclus
                  dans une reprise automatique.
                </AlertDescription>
              </Alert>
            ) : null}

            {assetsUnavailable ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>
                  {job.assetsCleanedAt
                    ? "Aperçus expirés"
                    : "Nettoyage en cours"}
                </AlertTitle>
                <AlertDescription>
                  Les sauvegardes et aperçus R2 expirent après sept jours. Ce
                  résultat reste consultable, mais n’est plus relançable.
                </AlertDescription>
              </Alert>
            ) : null}

            {job.status === "failed" && job.error ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Le bulk n’a pas pu aboutir</AlertTitle>
                <AlertDescription>{job.error}</AlertDescription>
              </Alert>
            ) : null}

            {previewItems.length ? (
              <section className="grid gap-3">
                <div>
                  <h3 className="font-medium">Aperçus avant / après</h3>
                  <p className="text-xs text-muted-foreground">
                    Échantillon borné du job en cours.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {previewItems.map((item) => (
                    <article
                      key={item._id}
                      className="overflow-hidden rounded-lg border bg-card"
                    >
                      <p className="truncate border-b px-3 py-2 text-xs font-medium">
                        {item.productTitle}
                        {item.referencedProductCount > 1
                          ? ` · ${item.referencedProductCount} produits`
                          : ""}
                      </p>
                      <div className="grid grid-cols-2">
                        <PreviewImage
                          label="Originale"
                          src={item.sourceUrl}
                          alt={`Image originale de ${item.productTitle}`}
                        />
                        <PreviewImage
                          label="Miroir"
                          src={item.outputUrl!}
                          alt={`Image miroir de ${item.productTitle}`}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {failedItems.length ? (
              <section className="grid gap-2">
                <h3 className="font-medium">Détails non traités</h3>
                <div
                  className="grid max-h-36 gap-2 overflow-y-auto"
                  role="region"
                  aria-label="Détails des images non traitées"
                  tabIndex={0}
                >
                  {failedItems.map((item) => (
                    <div
                      key={item._id}
                      className="rounded-md border p-2 text-xs"
                    >
                      <p className="font-medium">{item.productTitle}</p>
                      <p className="mt-1 text-muted-foreground">
                        {item.error ?? "Erreur inconnue"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Fermer
          </Button>
          {job && terminal && !job.dismissedAt ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onRequestDismiss}
            >
              <BusyIcon busy={dismissing} />
              {!dismissing ? <Archive data-icon="inline-start" /> : null}
              {canRetry ? "Ignorer et archiver" : "Archiver le résultat"}
            </Button>
          ) : null}
          {isNewFlow ? (
            <Button
              type="button"
              disabled={
                !selectedProductCount ||
                selectionTooLarge ||
                selectionOptionsLoading ||
                Boolean(selectionOptions?.unavailableProductCount) ||
                Boolean(selectionOptions?.lockedProducts.length) ||
                !selectedImagePositions.length ||
                busy
              }
              onClick={onStart}
            >
              <BusyIcon busy={starting} />
              {!starting ? <FlipHorizontal2 data-icon="inline-start" /> : null}
              Préparer les miroirs
            </Button>
          ) : null}
          {job && bulkTransformCanCancel(job) ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={onRequestCancel}
            >
              Abandonner le bulk
            </Button>
          ) : null}
          {job && canRetry ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onRetry}
            >
              <BusyIcon busy={retrying} />
              {!retrying ? <RotateCcw data-icon="inline-start" /> : null}
              Reprendre les erreurs
            </Button>
          ) : null}
          {job && bulkTransformCanPublish(job) ? (
            <Button type="button" disabled={busy} onClick={onRequestPublish}>
              <UploadCloud data-icon="inline-start" />
              Remplacer {readyToPublish} image
              {readyToPublish === 1 ? "" : "s"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewImage({
  label,
  src,
  alt,
}: {
  label: string;
  src: string;
  alt: string;
}) {
  return (
    <figure className="min-w-0 border-r last:border-r-0">
      <div className="aspect-square overflow-hidden bg-muted">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="size-full object-contain"
        />
      </div>
      <figcaption className="border-t px-2 py-1.5 text-center text-[0.7rem] text-muted-foreground">
        {label}
      </figcaption>
    </figure>
  );
}
