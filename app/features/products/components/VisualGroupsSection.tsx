import { useAction, useMutation } from "convex/react";
import {
  Check,
  ExternalLink,
  ImageIcon,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

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
  const assignReference = useMutation(api.visualGroups.assignReference);
  const removeReference = useMutation(api.visualGroups.removeReference);
  const confirmGroupReferences = useMutation(
    api.visualGroups.confirmGroupReferences,
  );
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
      : (data.config?.publishMode ?? "separate_products");
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

  return (
    <section
      className="overflow-hidden rounded-lg border bg-card text-card-foreground"
      aria-labelledby="visual-groups-title"
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="visual-groups-title" className="font-semibold">
              Organisation des déclinaisons
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
            Chaque groupe visuel devient une déclinaison produit avec ses
            références, ses images et ses variantes Shopify.
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
                <SelectItem value="separate_products">
                  Une déclinaison = un produit
                </SelectItem>
                <SelectItem value="variant_media">
                  Conserver un seul produit
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
                    <RadioGroupItem
                      value="separate_products"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Une déclinaison = un produit
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Crée un produit Shopify enfant par groupe visuel.
                      </span>
                    </span>
                  </Label>
                  <Label className="flex min-h-14 items-start gap-3 rounded-lg border bg-background p-3 has-data-[state=checked]:border-primary">
                    <RadioGroupItem
                      value="variant_media"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Conserver un seul produit
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        Associe une galerie à chaque groupe de variantes.
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
              const groupReferences = [...group.references].sort(
                (left, right) =>
                  Number(right.confirmed) - Number(left.confirmed) ||
                  left.position - right.position,
              );
              const confirmedCount = groupReferences.filter(
                (reference) => reference.confirmed,
              ).length;
              const pendingCount = groupReferences.length - confirmedCount;
              const previewReferences = groupReferences.slice(0, 3);
              const picking = referencePickerGroupId === group._id;
              const confirming = busyAction === `confirm:${group._id}`;
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
                          {groupReferences.length > previewReferences.length ? (
                            <span className="grid size-12 place-items-center rounded-md border-2 border-card bg-muted text-xs font-medium">
                              +{groupReferences.length - previewReferences.length}
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
                          disabled={confirming}
                          onClick={() =>
                            void handleConfirmGroup(group._id, pendingCount)
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
                        disabled={changing}
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
                      <p className="text-xs font-medium">
                        Images de référence pour {group.label}
                      </p>
                      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                        Sélectionnez toutes les vues utiles de cette
                        déclinaison.
                      </p>
                      {references.length ? (
                        <div className="flex flex-wrap gap-2">
                          {references.map((reference, index) => {
                            const selectedReference = group.references.find(
                              (groupReference) =>
                                groupReference.mediaId === reference.mediaId,
                            );
                            const selected = Boolean(selectedReference);
                            return (
                              <button
                                key={reference._id}
                                type="button"
                                disabled={!reference.mediaId || changing}
                                className={cn(
                                  "group relative size-16 overflow-hidden rounded-md border bg-background outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                                  selected &&
                                    "border-primary ring-2 ring-primary/20",
                                )}
                                aria-label={`${
                                  selected ? "Retirer" : "Ajouter"
                                } l’image Shopify ${index + 1} ${
                                  selected ? "des" : "aux"
                                } références de ${group.label}`}
                                aria-pressed={selected}
                                onClick={() =>
                                  void handleReferenceToggle(
                                    group._id,
                                    reference,
                                    selectedReference,
                                  )
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
              Produits enfants créés dans Shopify
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
