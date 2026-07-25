import { useAction, useMutation } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  ImageIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { LightboxImage } from "@/components/common/Lightbox";
import { BusyIcon } from "@/components/page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

import type { VisualGroupsData } from "../types";
import {
  moveReferenceId,
  orderVisualReferences,
} from "../lib/visualReferenceOrder";

const analysisLabels: Record<
  Doc<"visualGroupConfigs">["analysisStatus"],
  string
> = {
  not_started: "Non analysées",
  running: "Analyse en cours",
  ready: "Références prêtes",
  needs_review: "Validation requise",
  failed: "Analyse échouée",
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
}

function confidenceLabel(reference: Doc<"visualGroupReferences"> | undefined) {
  if (!reference) return "Référence manquante";
  if (reference.confirmed) return "Référence confirmée";
  return `Confiance ${Math.round(reference.confidence * 100)} %`;
}

function sourceLabel(reference: Doc<"visualGroupReferences">) {
  if (reference.assignmentSource === "shopify") return "Shopify";
  if (reference.assignmentSource === "manual") return "Manuelle";
  if (reference.assignmentSource === "ai_crop") return "IA · recadrée";
  if (reference.assignmentSource === "ai") return "IA";
  return "Détection automatique";
}

function canonicalReferences(data: VisualGroupsData) {
  const references = [
    ...data.groups.flatMap((group) => group.references),
    ...data.unassignedReferences,
  ].filter((reference) => !reference.sourceReferenceId);
  return Array.from(
    new Map(
      references.map((reference) => [
        reference.mediaId ?? reference.sourceUrl,
        reference,
      ]),
    ).values(),
  ).sort((left, right) => left.position - right.position);
}

export function VisualGroupsSection({
  productId,
  storeHandle,
  data,
  onZoom,
}: {
  productId: Id<"products">;
  storeHandle?: string | null;
  data: VisualGroupsData | null | undefined;
  onZoom: (images: LightboxImage[], index: number) => void;
}) {
  const configure = useMutation(api.visualGroups.configure);
  const assignReference = useMutation(api.visualGroups.assignReference);
  const removeReference = useMutation(api.visualGroups.removeReference);
  const reorderReferences = useMutation(api.visualGroups.reorderReferences);
  const confirmGroupReferences = useMutation(
    api.visualGroups.confirmGroupReferences,
  );
  const analyze = useAction(api.visualGroupAnalysis.analyze);

  const [optionSelection, setOptionSelection] = useState<{
    productId: Id<"products">;
    values: Set<string>;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [referencePickerGroupId, setReferencePickerGroupId] =
    useState<Id<"visualGroups"> | null>(null);

  const references = useMemo(
    () => (data ? canonicalReferences(data) : []),
    [data],
  );

  if (data === undefined) {
    return (
      <section
        className="rounded-lg border bg-card p-4"
        aria-label="Chargement des variantes visuelles"
      >
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-14 w-full" />
        </div>
      </section>
    );
  }

  if (data === null) return null;

  const selectedOptions =
    optionSelection?.productId === productId
      ? optionSelection.values
      : new Set(data.suggestedOptionNames);
  const meaningfulOptions = data.options.filter(
    (option) =>
      !(
        option.name.toLowerCase() === "title" &&
        option.values?.length === 1 &&
        option.values[0] === "Default Title"
      ),
  );
  const readyGroups = data.groups.filter((group) => group.ready).length;
  const incompleteGroups = data.groups.length - readyGroups;
  const unanalyzedReferences = references.filter(
    (reference) => !reference.confirmed,
  ).length;
  const analysisRunning =
    busyAction === "analyze" || data.config?.analysisStatus === "running";

  const toggleOption = (name: string) => {
    setOptionSelection((current) => {
      const next = new Set(
        current?.productId === productId
          ? current.values
          : data.suggestedOptionNames,
      );
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { productId, values: next };
    });
  };

  const handleConfigure = async () => {
    if (!selectedOptions.size) return;
    setBusyAction("configure");
    try {
      await configure({
        productId,
        optionNames: Array.from(selectedOptions),
      });
      toast.success("Groupes visuels créés");
    } catch (error) {
      toast.error("Configuration impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAnalyze = async () => {
    setBusyAction("analyze");
    try {
      const result = await analyze({ productId });
      const suggestions = `${result.suggested} suggestion${
        result.suggested === 1 ? "" : "s"
      }`;
      if (result.unmatched > 0) {
        toast.warning("Analyse terminée, vérification requise", {
          description: `${suggestions} · ${result.unmatched} image${
            result.unmatched === 1 ? "" : "s"
          } à classer manuellement · ${formatUsd(result.costUsd)}`,
        });
      } else {
        toast.success("Analyse des références terminée", {
          description: `${suggestions} · ${formatUsd(result.costUsd)}`,
        });
      }
    } catch (error) {
      toast.error("Analyse impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmGroup = async (
    groupId: Id<"visualGroups">,
    pendingCount: number,
  ) => {
    setBusyAction(`confirm:${groupId}`);
    try {
      await confirmGroupReferences({ groupId });
      toast.success(
        `${pendingCount} référence${pendingCount === 1 ? "" : "s"} confirmée${
          pendingCount === 1 ? "" : "s"
        }`,
      );
    } catch (error) {
      toast.error("Confirmation impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReferenceToggle = async (
    groupId: Id<"visualGroups">,
    reference: Doc<"visualGroupReferences">,
    selectedReference?: Doc<"visualGroupReferences">,
  ) => {
    if (!reference.mediaId && !selectedReference) return;
    setBusyAction(`reference:${groupId}`);
    try {
      if (selectedReference) {
        await removeReference({ referenceId: selectedReference._id });
        toast.success("Référence retirée");
      } else if (reference.mediaId) {
        await assignReference({
          groupId,
          mediaId: reference.mediaId,
        });
        toast.success("Référence ajoutée");
      }
    } catch (error) {
      toast.error("Modification des références impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReferenceMove = async (
    groupId: Id<"visualGroups">,
    groupReferences: Doc<"visualGroupReferences">[],
    referenceId: Id<"visualGroupReferences">,
    direction: -1 | 1,
  ) => {
    const referenceIds = moveReferenceId(
      groupReferences.map((reference) => reference._id),
      referenceId,
      direction,
    );
    setBusyAction(`order:${groupId}`);
    try {
      await reorderReferences({ groupId, referenceIds });
    } catch (error) {
      toast.error("Réorganisation impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-lg border bg-card text-card-foreground"
      aria-labelledby="visual-groups-title"
    >
      <Accordion
        type="single"
        collapsible
        defaultValue={
          !data.config || data.config.analysisError
            ? "visual-groups"
            : undefined
        }
      >
        <AccordionItem value="visual-groups" className="border-0">
          <AccordionTrigger className="items-center px-4 py-3 hover:no-underline sm:py-4 [&_[data-slot=accordion-trigger-icon]]:ml-4">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span id="visual-groups-title" className="font-semibold">
                  Organisation des déclinaisons
                </span>
                {data.config ? (
                  <Badge variant="outline" className="bg-muted">
                    {readyGroups}/{data.groups.length} prêts
                  </Badge>
                ) : null}
              </span>
              <span className="mt-1 block max-w-3xl text-sm font-normal leading-6 text-muted-foreground">
                Chaque groupe visuel devient une déclinaison produit avec ses
                références, ses images et ses variantes Shopify.
              </span>
            </span>
          </AccordionTrigger>

          <AccordionContent className="pb-0 [&_p:not(:last-child)]:mb-0">
            {!data.config ? (
              <div className="border-t p-4">
                {meaningfulOptions.length ? (
                  <div className="space-y-4">
                    <fieldset>
                      <legend className="text-sm font-medium">
                        Quelles options changent visuellement le produit ?
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {meaningfulOptions.map((option) => (
                          <Label
                            key={option.name}
                            className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-3"
                          >
                            <Checkbox
                              checked={selectedOptions.has(option.name)}
                              onCheckedChange={() => toggleOption(option.name)}
                            />
                            <span>{option.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.values?.length ?? 0} valeurs
                            </span>
                          </Label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="flex justify-end">
                      <Button
                        disabled={
                          !selectedOptions.size || busyAction === "configure"
                        }
                        onClick={() => void handleConfigure()}
                      >
                        <BusyIcon busy={busyAction === "configure"} />
                        Créer les déclinaisons
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-24 items-center gap-3 text-sm text-muted-foreground">
                    <ImageIcon className="size-5 shrink-0" />
                    Ce produit Shopify ne contient aucune option de variante à
                    séparer.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {analysisLabels[data.config.analysisStatus]}
                      </span>
                      <span className="text-muted-foreground">
                        {formatUsd(data.config.analysisCostUsd ?? 0)}
                      </span>
                      {incompleteGroups ? (
                        <span className="text-muted-foreground">
                          · {incompleteGroups} groupe
                          {incompleteGroups === 1 ? "" : "s"} à compléter
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Axes : {data.config.optionNames.join(" + ")}
                      {data.config.analysisModel
                        ? ` · ${data.config.analysisModel}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={analysisRunning || unanalyzedReferences === 0}
                    onClick={() => void handleAnalyze()}
                  >
                    <BusyIcon busy={analysisRunning} />
                    {!analysisRunning ? (
                      <Sparkles data-icon="inline-start" />
                    ) : null}
                    Analyser avec l’IA
                  </Button>
                </div>

                {data.config.analysisError ? (
                  <div
                    role="alert"
                    className="border-t bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    {data.config.analysisError}
                  </div>
                ) : null}

                <div className="divide-y">
                  {data.groups.map((group) => {
                    const groupReferences = orderVisualReferences(
                      group.references,
                    );
                    const referenceLightboxImages: LightboxImage[] =
                      groupReferences.map((reference, index) => ({
                        url: reference.referenceUrl,
                        label: `${group.label} · Référence ${index + 1}`,
                      }));
                    const confirmedCount = groupReferences.filter(
                      (reference) => reference.confirmed,
                    ).length;
                    const pendingCount =
                      groupReferences.length - confirmedCount;
                    const previewReferences = groupReferences.slice(0, 3);
                    const selectedMediaIds = new Set(
                      groupReferences
                        .map((reference) => reference.mediaId)
                        .filter((mediaId): mediaId is string =>
                          Boolean(mediaId),
                        ),
                    );
                    const availableReferences = references.filter(
                      (reference) =>
                        !reference.mediaId ||
                        !selectedMediaIds.has(reference.mediaId),
                    );
                    const picking = referencePickerGroupId === group._id;
                    const confirming = busyAction === `confirm:${group._id}`;
                    const changing = busyAction === `reference:${group._id}`;
                    const reordering = busyAction === `order:${group._id}`;
                    const referencesBusy = changing || reordering;

                    return (
                      <div key={group._id}>
                        <div className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[minmax(0,1fr)_18rem_minmax(8rem,auto)] md:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="size-5 shrink-0 rounded-full border shadow-xs"
                              style={{
                                background: group.swatchCss ?? "var(--muted)",
                              }}
                              aria-label={`Nuance ${group.label}`}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {group.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {group.variants.length} variante
                                {group.variants.length === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>

                          <div className="flex min-w-0 items-center gap-3">
                            {previewReferences.length ? (
                              <div className="flex shrink-0 -space-x-3">
                                {previewReferences.map((reference) => (
                                  <img
                                    key={reference._id}
                                    src={reference.referenceUrl}
                                    alt=""
                                    title={`${confidenceLabel(reference)} · ${sourceLabel(
                                      reference,
                                    )}`}
                                    className="size-12 rounded-md border-2 border-card bg-muted object-cover"
                                  />
                                ))}
                                {groupReferences.length >
                                previewReferences.length ? (
                                  <span className="grid size-12 place-items-center rounded-md border-2 border-card bg-muted text-xs font-medium">
                                    +
                                    {groupReferences.length -
                                      previewReferences.length}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted">
                                <ImageIcon className="size-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              {groupReferences.length ? (
                                <>
                                  <p className="truncate text-sm font-medium">
                                    {groupReferences.length} image
                                    {groupReferences.length === 1 ? "" : "s"} de
                                    référence
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {confirmedCount} confirmée
                                    {confirmedCount === 1 ? "" : "s"}
                                    {pendingCount
                                      ? ` · ${pendingCount} à confirmer`
                                      : ""}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="truncate text-sm font-medium">
                                    Références manquantes
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    Choisissez une ou plusieurs images Shopify
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            {pendingCount ? (
                              <Button
                                size="sm"
                                className="min-h-11 sm:min-h-8"
                                disabled={confirming || referencesBusy}
                                onClick={() =>
                                  void handleConfirmGroup(
                                    group._id,
                                    pendingCount,
                                  )
                                }
                              >
                                <BusyIcon busy={confirming} />
                                {!confirming ? (
                                  <Check data-icon="inline-start" />
                                ) : null}
                                Tout confirmer
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              className="min-h-11 sm:min-h-8"
                              variant="outline"
                              disabled={referencesBusy}
                              aria-expanded={picking}
                              onClick={() =>
                                setReferencePickerGroupId((current) =>
                                  current === group._id ? null : group._id,
                                )
                              }
                            >
                              {groupReferences.length ? "Gérer" : "Choisir"}
                            </Button>
                          </div>
                        </div>

                        {picking ? (
                          <div className="border-t bg-muted/30 px-4 py-3">
                            <p className="text-sm font-medium">
                              Ordre des références — {group.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              L’IA utilise les images de haut en bas. La n° 1
                              est prioritaire ; le nombre d’images envoyé dépend
                              du prompt.
                            </p>

                            {groupReferences.length ? (
                              <ol className="mt-3 divide-y border-y">
                                {groupReferences.map((reference, index) => (
                                  <li
                                    key={reference._id}
                                    className="flex min-w-0 flex-wrap items-center gap-3 py-2"
                                  >
                                    <span
                                      className={cn(
                                        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                                        index === 0
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted text-muted-foreground",
                                      )}
                                      aria-label={`Position ${index + 1}`}
                                    >
                                      {index + 1}
                                    </span>
                                    <button
                                      type="button"
                                      className="size-24 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-muted outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                      aria-label={`Agrandir la référence ${index + 1} de ${group.label}`}
                                      onClick={() =>
                                        onZoom(referenceLightboxImages, index)
                                      }
                                    >
                                      <img
                                        src={reference.referenceUrl}
                                        alt=""
                                        className="size-full object-cover"
                                      />
                                    </button>
                                    <div className="min-w-32 flex-1">
                                      <p className="truncate text-sm font-medium">
                                        {index === 0
                                          ? "Prioritaire pour l’IA"
                                          : `Référence ${index + 1}`}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {reference.confirmed
                                          ? "Confirmée"
                                          : "À confirmer"}{" "}
                                        · {sourceLabel(reference)}
                                      </p>
                                    </div>
                                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-11 sm:size-8"
                                        disabled={index === 0 || referencesBusy}
                                        aria-label={`Monter l’image ${index + 1}`}
                                        title="Monter"
                                        onClick={() =>
                                          void handleReferenceMove(
                                            group._id,
                                            groupReferences,
                                            reference._id,
                                            -1,
                                          )
                                        }
                                      >
                                        <ArrowUp />
                                      </Button>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-11 sm:size-8"
                                        disabled={
                                          index ===
                                            groupReferences.length - 1 ||
                                          referencesBusy
                                        }
                                        aria-label={`Descendre l’image ${index + 1}`}
                                        title="Descendre"
                                        onClick={() =>
                                          void handleReferenceMove(
                                            group._id,
                                            groupReferences,
                                            reference._id,
                                            1,
                                          )
                                        }
                                      >
                                        <ArrowDown />
                                      </Button>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-11 text-destructive hover:text-destructive sm:size-8"
                                        disabled={referencesBusy}
                                        aria-label={`Retirer l’image ${index + 1}`}
                                        title="Retirer"
                                        onClick={() =>
                                          void handleReferenceToggle(
                                            group._id,
                                            reference,
                                            reference,
                                          )
                                        }
                                      >
                                        <X />
                                      </Button>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="mt-3 text-sm text-muted-foreground">
                                Aucune image sélectionnée pour cette
                                déclinaison.
                              </p>
                            )}

                            <div
                              className={cn(
                                "mt-4",
                                groupReferences.length && "border-t pt-4",
                              )}
                            >
                              <p className="text-xs font-medium">
                                Ajouter des images Shopify
                              </p>
                              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                                Elles seront ajoutées à la fin, dans l’ordre de
                                sélection.
                              </p>
                              {!references.length ? (
                                <p className="text-sm text-muted-foreground">
                                  Synchronisez d’abord des images depuis
                                  Shopify.
                                </p>
                              ) : availableReferences.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {availableReferences.map(
                                    (reference, index) => (
                                      <button
                                        key={reference._id}
                                        type="button"
                                        disabled={
                                          !reference.mediaId || referencesBusy
                                        }
                                        className="relative size-16 overflow-hidden rounded-md border bg-background outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label={`Ajouter l’image Shopify ${
                                          index + 1
                                        } aux références de ${group.label}`}
                                        onClick={() =>
                                          void handleReferenceToggle(
                                            group._id,
                                            reference,
                                          )
                                        }
                                      >
                                        <img
                                          src={reference.sourceUrl}
                                          alt=""
                                          className="size-full object-cover"
                                        />
                                      </button>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Toutes les images Shopify sont déjà
                                  sélectionnées.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {data.unassignedReferences.length ? (
                  <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                    {data.unassignedReferences.length} image
                    {data.unassignedReferences.length === 1 ? "" : "s"} Shopify
                    non assignée
                    {data.unassignedReferences.length === 1 ? "" : "s"}.
                  </div>
                ) : null}

                {data.family ? (
                  <div className="border-t bg-muted/40 px-4 py-3">
                    <p className="text-sm font-medium">
                      Produits enfants créés dans Shopify
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.family.members.map((member) => {
                        const numericId = member.shopifyProductId
                          .split("/")
                          .pop();
                        const href =
                          storeHandle && numericId
                            ? `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`
                            : null;
                        return href ? (
                          <Button
                            key={member._id}
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a href={href} target="_blank" rel="noreferrer">
                              {member.title}
                              <ExternalLink data-icon="inline-end" />
                            </a>
                          </Button>
                        ) : (
                          <Badge key={member._id} variant="outline">
                            {member.title}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
