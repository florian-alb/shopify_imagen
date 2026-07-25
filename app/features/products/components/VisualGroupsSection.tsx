import { useAction, useMutation } from "convex/react";
import {
  Check,
  ExternalLink,
  ImageIcon,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BusyIcon } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Doc, type Id } from "@/lib/convex";
import { errorMessage } from "@/lib/errors";

import type { VisualGroupsData } from "../types";

type PublishMode = "variant_media" | "separate_products";

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

function primaryReference(
  references: Doc<"visualGroupReferences">[],
): Doc<"visualGroupReferences"> | undefined {
  return (
    references.find((reference) => reference.confirmed) ?? references[0]
  );
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
}: {
  productId: Id<"products">;
  storeHandle?: string | null;
  data: VisualGroupsData | null | undefined;
}) {
  const configure = useMutation(api.visualGroups.configure);
  const setPublishMode = useMutation(api.visualGroups.setPublishMode);
  const setPrimaryReference = useMutation(
    api.visualGroups.setPrimaryReference,
  );
  const confirmReference = useMutation(api.visualGroups.confirmReference);
  const analyze = useAction(api.visualGroupAnalysis.analyze);

  const [optionSelection, setOptionSelection] = useState<{
    productId: Id<"products">;
    values: Set<string>;
  } | null>(null);
  const [draftMode, setDraftMode] = useState<{
    productId: Id<"products">;
    value: PublishMode;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [referencePickerGroupId, setReferencePickerGroupId] =
    useState<Id<"visualGroups"> | null>(null);
  const referencePickerTriggers = useRef(
    new Map<Id<"visualGroups">, HTMLButtonElement>(),
  );

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
  const draftPublishMode =
    draftMode?.productId === productId
      ? draftMode.value
      : (data.config?.publishMode ?? "variant_media");
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
  const modeLocked = data.publicationLocked;

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
        publishMode: draftPublishMode,
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

  const handleModeChange = async (publishMode: PublishMode) => {
    if (!data.config || modeLocked) return;
    setBusyAction("mode");
    try {
      await setPublishMode({ productId, publishMode });
      toast.success("Mode de publication mis à jour");
    } catch (error) {
      toast.error("Modification impossible", {
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
      toast.success("Analyse des références terminée", {
        description: `${result.suggested} suggestion${
          result.suggested === 1 ? "" : "s"
        } · ${formatUsd(result.costUsd)}`,
      });
    } catch (error) {
      toast.error("Analyse impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirm = async (
    referenceId: Id<"visualGroupReferences">,
  ) => {
    setBusyAction(`confirm:${referenceId}`);
    try {
      await confirmReference({ referenceId });
      toast.success("Référence confirmée");
    } catch (error) {
      toast.error("Confirmation impossible", {
        description: errorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReferenceChange = async (
    groupId: Id<"visualGroups">,
    reference: Doc<"visualGroupReferences">,
  ) => {
    if (!reference.mediaId) return;
    setBusyAction(`reference:${groupId}`);
    try {
      await setPrimaryReference({
        groupId,
        mediaId: reference.mediaId,
      });
      setReferencePickerGroupId(null);
      referencePickerTriggers.current.get(groupId)?.focus();
      toast.success("Référence du groupe mise à jour");
    } catch (error) {
      toast.error("Référence impossible à assigner", {
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
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="visual-groups-title" className="font-semibold">
              Variantes visuelles
            </h2>
            {data.config ? (
              <Badge variant="outline" className="bg-muted">
                {readyGroups}/{data.groups.length} prêts
              </Badge>
            ) : null}
            {modeLocked ? (
              <Badge variant="secondary">
                <LockKeyhole data-icon="inline-start" />
                Verrouillé
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Une référence confirmée par couleur, matière, taille ou combinaison
            d’options. Les images sont générées une seule fois par groupe.
          </p>
        </div>
        {data.config ? (
          <div className="w-full sm:w-56">
            <Label
              htmlFor="visual-publish-mode"
              className="text-xs text-muted-foreground"
            >
              Publication Shopify
            </Label>
            <Select
              value={data.config.publishMode}
              disabled={busyAction === "mode" || modeLocked}
              onValueChange={(value) =>
                void handleModeChange(value as PublishMode)
              }
            >
              <SelectTrigger
                id="visual-publish-mode"
                className="mt-1 h-11 w-full sm:h-9"
                aria-describedby={
                  modeLocked ? "visual-publish-mode-help" : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="variant_media">
                  Images par variante
                </SelectItem>
                <SelectItem value="separate_products">
                  Produits brouillons séparés
                </SelectItem>
              </SelectContent>
            </Select>
            {modeLocked ? (
              <p
                id="visual-publish-mode-help"
                className="mt-1 text-xs text-muted-foreground"
              >
                Verrouillé après la première publication.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

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

              <fieldset>
                <legend className="text-sm font-medium">
                  Publication Shopify
                </legend>
                <RadioGroup
                  className="mt-2 gap-2 sm:grid-cols-2"
                  value={draftPublishMode}
                  onValueChange={(value) =>
                    setDraftMode({
                      productId,
                      value: value as PublishMode,
                    })
                  }
                >
                  <Label className="flex min-h-14 items-start gap-3 rounded-lg border bg-background p-3 has-data-[state=checked]:border-primary">
                    <RadioGroupItem value="variant_media" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">
                        Un produit, images par variante
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Associe chaque galerie aux variantes correspondantes.
                      </span>
                    </span>
                  </Label>
                  <Label className="flex min-h-14 items-start gap-3 rounded-lg border bg-background p-3 has-data-[state=checked]:border-primary">
                    <RadioGroupItem
                      value="separate_products"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Un brouillon par groupe
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Conserve le produit source et crée des produits séparés.
                      </span>
                    </span>
                  </Label>
                </RadioGroup>
              </fieldset>

              <div className="flex justify-end">
                <Button
                  disabled={
                    !selectedOptions.size || busyAction === "configure"
                  }
                  onClick={() => void handleConfigure()}
                >
                  <BusyIcon busy={busyAction === "configure"} />
                  Créer les groupes
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
              const primary = primaryReference(group.references);
              const picking = referencePickerGroupId === group._id;
              const confirming =
                primary &&
                busyAction === `confirm:${primary._id}`;
              const changing = busyAction === `reference:${group._id}`;

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
                      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                        {primary ? (
                          <img
                            src={primary.referenceUrl}
                            alt={`Référence ${group.label}`}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {confidenceLabel(primary)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {primary
                            ? sourceLabel(primary)
                            : "Choisissez une image Shopify"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {primary && !primary.confirmed ? (
                        <Button
                          size="sm"
                          className="min-h-11 sm:min-h-8"
                          disabled={Boolean(confirming)}
                          onClick={() => void handleConfirm(primary._id)}
                        >
                          <BusyIcon busy={Boolean(confirming)} />
                          {!confirming ? (
                            <Check data-icon="inline-start" />
                          ) : null}
                          Confirmer
                        </Button>
                      ) : null}
                      <Button
                        ref={(node) => {
                          if (node) {
                            referencePickerTriggers.current.set(group._id, node);
                          } else {
                            referencePickerTriggers.current.delete(group._id);
                          }
                        }}
                        size="sm"
                        className="min-h-11 sm:min-h-8"
                        variant="outline"
                        disabled={changing}
                        aria-expanded={picking}
                        onClick={() =>
                          setReferencePickerGroupId((current) =>
                            current === group._id ? null : group._id,
                          )
                        }
                      >
                        {primary ? "Changer" : "Choisir"}
                      </Button>
                    </div>
                  </div>

                  {picking ? (
                    <div className="border-t bg-muted/30 px-4 py-3">
                      <p className="mb-2 text-xs font-medium">
                        Image de référence pour {group.label}
                      </p>
                      {references.length ? (
                        <div className="flex flex-wrap gap-2">
                          {references.map((reference, index) => {
                            const selected =
                              primary?.mediaId === reference.mediaId;
                            return (
                              <button
                                key={reference._id}
                                type="button"
                                disabled={!reference.mediaId || changing}
                                className="group relative size-16 overflow-hidden rounded-md border bg-background outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Utiliser l’image Shopify ${
                                  index + 1
                                } pour ${group.label}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  void handleReferenceChange(group._id, reference)
                                }
                              >
                                <img
                                  src={reference.sourceUrl}
                                  alt=""
                                  className="size-full object-cover"
                                />
                                {selected ? (
                                  <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                                    <Check className="size-3" />
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Synchronisez d’abord des images depuis Shopify.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {data.unassignedReferences.length ? (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              {data.unassignedReferences.length} image
              {data.unassignedReferences.length === 1 ? "" : "s"} Shopify non
              assignée{data.unassignedReferences.length === 1 ? "" : "s"}.
            </div>
          ) : null}

          {data.family ? (
            <div className="border-t bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium">
                Produits brouillons créés dans Shopify
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.family.members.map((member) => {
                  const numericId = member.shopifyProductId.split("/").pop();
                  const href =
                    storeHandle && numericId
                      ? `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`
                      : null;
                  return href ? (
                    <Button key={member._id} variant="outline" size="sm" asChild>
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
    </section>
  );
}
