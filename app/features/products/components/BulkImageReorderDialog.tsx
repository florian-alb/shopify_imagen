import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  CheckCircle2,
  Images,
  RotateCcw,
  Undo2,
} from "lucide-react";

import { BusyIcon, StateBadge } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  BulkReorderDetails,
  BulkReorderSelectionOptions,
} from "../hooks/useBulkImageReorder";
import {
  bulkReorderCanCancel,
  bulkReorderCanRestore,
  bulkReorderCanRetry,
  bulkReorderDisplayStatusLabel,
  bulkReorderIsTerminal,
  bulkReorderProgress,
  MAX_BULK_REORDER_PRODUCTS,
} from "../lib/bulkImageReorderViewModel";

function statusTone(job: BulkReorderDetails["job"]) {
  if (job.restoreStatus === "completed") return "success" as const;
  if (
    job.restoreStatus === "queued" ||
    job.restoreStatus === "running" ||
    job.restoreStatus === "partial"
  ) {
    return "warning" as const;
  }
  if (job.status === "completed") return "success" as const;
  if (job.status === "failed" || job.status === "cancelled") {
    return "danger" as const;
  }
  return "warning" as const;
}

export function BulkImageReorderDialog({
  open,
  isNewFlow,
  selectedProductCount,
  selectionOptions,
  selectionOptionsLoading,
  firstPosition,
  secondPosition,
  eligibleProductCount,
  details,
  starting,
  retrying,
  busy,
  commandError,
  onOpenChange,
  onCloseAutoFocus,
  onFirstPositionChange,
  onSecondPositionChange,
  onStart,
  onRetry,
  onClose,
  onRequestCancel,
  onRequestRestore,
  onRequestDismiss,
}: {
  open: boolean;
  isNewFlow: boolean;
  selectedProductCount: number;
  selectionOptions: BulkReorderSelectionOptions | undefined;
  selectionOptionsLoading: boolean;
  firstPosition: number;
  secondPosition: number;
  eligibleProductCount: number;
  details: BulkReorderDetails | null | undefined;
  starting: boolean;
  retrying: boolean;
  busy: boolean;
  commandError: string | null;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  onFirstPositionChange: (position: number) => void;
  onSecondPositionChange: (position: number) => void;
  onStart: () => void;
  onRetry: () => void;
  onClose: () => void;
  onRequestCancel: () => void;
  onRequestRestore: () => void;
  onRequestDismiss: () => void;
}) {
  const job = details?.job;
  const loadingExisting = !isNewFlow && details === undefined;
  const progress = job ? bulkReorderProgress(job) : null;
  const terminal = job ? bulkReorderIsTerminal(job.status) : false;
  const positions = selectionOptions?.positions ?? [];
  const selectedTooLarge =
    selectedProductCount > MAX_BULK_REORDER_PRODUCTS;
  const lockedCount = selectionOptions?.lockedProducts.length ?? 0;
  const unavailableCount = selectionOptions?.unavailableProductCount ?? 0;
  const skippedCount = Math.max(
    0,
    selectedProductCount - eligibleProductCount,
  );
  const insufficientCount = Math.max(
    0,
    skippedCount - lockedCount - unavailableCount,
  );
  const ignoredReasons = [
    insufficientCount
      ? `${insufficientCount} produit${insufficientCount === 1 ? "" : "s"} sans image à la position requise`
      : null,
    lockedCount
      ? `${lockedCount} produit${lockedCount === 1 ? " verrouillé" : "s verrouillés"}`
      : null,
    unavailableCount
      ? `${unavailableCount} produit${unavailableCount === 1 ? " indisponible" : "s indisponibles"}`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const samePosition = firstPosition === secondPosition;
  const firstPreview = positions.find(
    (option) => option.position === firstPosition,
  );
  const secondPreview = positions.find(
    (option) => option.position === secondPosition,
  );
  const failures = job
    ? job.failedItems +
      job.conflictItems +
      (job.restoreFailedItems ?? 0) +
      (job.restoreConflictItems ?? 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!busy}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="size-5" />
            Réorganiser les images en masse
          </DialogTitle>
          <DialogDescription>
            Intervertit deux positions dans chaque galerie Shopify sans changer
            les fichiers ni les associations aux variantes.
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
          <div className="grid gap-5">
            {selectedTooLarge ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Sélection trop grande</AlertTitle>
                <AlertDescription>
                  Une réorganisation accepte au maximum {MAX_BULK_REORDER_PRODUCTS} produits.
                  Scindez cette sélection en plusieurs traitements.
                </AlertDescription>
              </Alert>
            ) : selectionOptionsLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground">
                <BusyIcon busy />
                Lecture des galeries Shopify…
              </div>
            ) : (
              <>
                <section className="grid gap-3" aria-labelledby="reorder-positions-title">
                  <div>
                    <h3 id="reorder-positions-title" className="font-medium">
                      Positions à intervertir
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Choisissez deux positions différentes. Les positions commencent à 1.
                    </p>
                  </div>
                  <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                    <PositionChoice
                      label="Première position"
                      value={firstPosition}
                      positions={positions}
                      preview={firstPreview}
                      disabled={busy}
                      invalid={samePosition}
                      onChange={onFirstPositionChange}
                    />
                    <ArrowLeftRight className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
                    <PositionChoice
                      label="Deuxième position"
                      value={secondPosition}
                      positions={positions}
                      preview={secondPreview}
                      disabled={busy}
                      invalid={samePosition}
                      onChange={onSecondPositionChange}
                    />
                  </div>
                  {samePosition ? (
                    <p
                      id="bulk-reorder-position-error"
                      className="text-sm font-medium text-destructive"
                      role="status"
                      aria-live="polite"
                    >
                      Choisissez deux positions différentes.
                    </p>
                  ) : null}
                </section>

                <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Résumé de la sélection">
                  <Metric label="Sélectionnés" value={selectedProductCount} />
                  <Metric label="Éligibles" value={eligibleProductCount} />
                  <Metric label="Ignorés" value={skippedCount} />
                  <Metric label="Verrouillés" value={lockedCount} />
                </section>

                {skippedCount ? (
                  <Alert>
                    <AlertTriangle />
                    <AlertTitle>Certains produits seront ignorés</AlertTitle>
                    <AlertDescription>
                      {ignoredReasons.join(" · ")}. Ces produits seront comptabilisés
                      comme ignorés, sans faire échouer l’opération.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Alert>
                  <ArrowLeftRight />
                  <AlertTitle>Modification immédiate sur Shopify</AlertTitle>
                  <AlertDescription>
                    L’ordre est relu avant chaque écriture. Si une autre action le modifie,
                    le produit passe en conflit et son ordre courant est conservé.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
        ) : loadingExisting ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <BusyIcon busy />
            Chargement de l’opération…
          </div>
        ) : !job ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Opération introuvable</AlertTitle>
            <AlertDescription>
              Ce résultat n’est plus disponible pour la boutique active.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                role="status"
                aria-live="polite"
              >
                <StateBadge state={statusTone(job)}>
                  {bulkReorderDisplayStatusLabel(job)}
                </StateBadge>
                <span className="tabular-nums text-muted-foreground">
                  {progress?.completed ?? 0} / {progress?.total ?? 0}
                </span>
              </div>
              <Progress
                value={progress?.percent ?? 0}
                aria-label={
                  progress?.restoring
                    ? "Progression de la restauration des galeries"
                    : "Progression de la réorganisation des galeries"
                }
                aria-valuetext={`${progress?.completed ?? 0} sur ${progress?.total ?? 0} galeries`}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Positions {job.firstPosition} ↔ {job.secondPosition}</span>
                <span>{job.completedItems} réorganisés</span>
                {job.skippedItems ? <span>{job.skippedItems} ignorés</span> : null}
                {job.lockedItems ? <span>{job.lockedItems} verrouillés</span> : null}
                {job.conflictItems ? <span>{job.conflictItems} conflits</span> : null}
                {job.failedItems ? <span>{job.failedItems} échecs</span> : null}
                {job.restoreStatus ? <span>{job.restoredItems ?? 0} restaurés</span> : null}
              </div>
            </div>

            {job.status === "completed" && !job.restoreStatus ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Réorganisation terminée</AlertTitle>
                <AlertDescription>
                  {job.completedItems} galerie
                  {job.completedItems === 1 ? " a été réorganisée" : "s ont été réorganisées"}
                  {" "}et vérifiées sur Shopify.
                </AlertDescription>
              </Alert>
            ) : null}

            {job.restoreStatus === "completed" ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Ordre original restauré</AlertTitle>
                <AlertDescription>
                  {job.restoredItems ?? 0} galerie
                  {(job.restoredItems ?? 0) === 1 ? " a" : "s ont"} retrouvé son ordre d’origine.
                </AlertDescription>
              </Alert>
            ) : null}

            {failures ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Produits non modifiés ou à reprendre</AlertTitle>
                <AlertDescription>
                  {job.restoreStatus
                    ? "Les échecs et conflits de restauration ont conservé l’ordre Shopify actuel."
                    : "Les conflits signalent un ordre Shopify différent du snapshot attendu; ces galeries n’ont pas été écrasées."}
                </AlertDescription>
              </Alert>
            ) : null}

            {details.errorItems.length ? (
              <section className="grid gap-2">
                <h3 className="font-medium">Détails non traités</h3>
                <div className="grid max-h-44 gap-2 overflow-y-auto" role="region" aria-label="Produits non traités" tabIndex={0}>
                  {details.errorItems.map((item) => (
                    <div key={item._id} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">{item.productTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.restoreError ?? item.error ?? "Erreur inconnue"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}

        <DialogFooter className="[&>button]:min-h-11 sm:[&>button]:min-h-8">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Fermer
          </Button>
          {job && terminal && !job.dismissedAt && job.restoreStatus !== "running" ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onRequestDismiss}>
              <Archive data-icon="inline-start" />
              Archiver
            </Button>
          ) : null}
          {isNewFlow ? (
            <Button
              type="button"
              className="h-auto min-h-8 whitespace-normal text-center"
              disabled={
                selectedTooLarge ||
                selectionOptionsLoading ||
                samePosition ||
                !eligibleProductCount ||
                busy
              }
              onClick={onStart}
            >
              <BusyIcon busy={starting} />
              {!starting ? <ArrowLeftRight data-icon="inline-start" /> : null}
              Intervertir les positions {firstPosition} et {secondPosition} sur {eligibleProductCount} produit
              {eligibleProductCount === 1 ? "" : "s"}
            </Button>
          ) : null}
          {job && bulkReorderCanCancel(job) ? (
            <Button type="button" variant="destructive" disabled={busy} onClick={onRequestCancel}>
              Abandonner
            </Button>
          ) : null}
          {job && bulkReorderCanRetry(job) ? (
            <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
              <BusyIcon busy={retrying} />
              {!retrying ? <RotateCcw data-icon="inline-start" /> : null}
              Reprendre les échecs et conflits
            </Button>
          ) : null}
          {job && bulkReorderCanRestore(job) ? (
            <Button
              type="button"
              className="h-auto min-h-8 whitespace-normal text-center"
              disabled={busy}
              onClick={onRequestRestore}
            >
              <Undo2 data-icon="inline-start" />
              Restaurer l’ordre original
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PositionChoice({
  label,
  value,
  positions,
  preview,
  disabled,
  invalid,
  onChange,
}: {
  label: string;
  value: number;
  positions: BulkReorderSelectionOptions["positions"];
  preview?: BulkReorderSelectionOptions["positions"][number];
  disabled: boolean;
  invalid: boolean;
  onChange: (position: number) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Select value={String(value)} disabled={disabled} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger
          className="h-11 w-full sm:h-8"
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "bulk-reorder-position-error" : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {positions.map((position) => (
            <SelectItem key={position.position} value={String(position.position)}>
              Image n°{position.position} · {position.productCount} produit
              {position.productCount === 1 ? "" : "s"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex min-h-12 items-center gap-2">
        {preview?.previews.length ? (
          preview.previews.slice(0, 3).map((image) => (
            <img
              key={image.productId}
              src={image.url}
              alt={`Image ${value} de ${image.productTitle}`}
              className="size-12 rounded-md border bg-muted object-contain"
              loading="lazy"
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Aucun aperçu disponible</span>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
