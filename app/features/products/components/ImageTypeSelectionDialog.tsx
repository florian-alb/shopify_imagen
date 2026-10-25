import { WandSparkles } from "lucide-react";

import { BusyIcon } from "@/components/page";
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
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

import { VariantGenerationControls } from "./VariantGenerationControls";
import { VisualGroupGenerationChoice } from "./VisualGroupGenerationChoice";
import type { useVariantGenerationSelection } from "../hooks/useVariantGenerationSelection";
import type { VisualGroupsData } from "../types";

export function ImageTypeSelectionDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  variants,
  visualGroupsData,
  selectedGroupIds,
  textOnlyGroupIds,
  focusedGroupId,
  onToggleGroup,
  onToggleGroupReferences,
  busy,
  title,
  description,
  submitLabel,
  onToggleType,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Doc<"promptTemplates">[];
  selectedTypes: Set<string>;
  variants: ReturnType<typeof useVariantGenerationSelection>;
  visualGroupsData?: VisualGroupsData | null;
  selectedGroupIds?: Set<Id<"visualGroups">>;
  textOnlyGroupIds?: Set<Id<"visualGroups">>;
  focusedGroupId?: Id<"visualGroups"> | null;
  onToggleGroup?: (groupId: Id<"visualGroups">) => void;
  onToggleGroupReferences?: (groupId: Id<"visualGroups">) => void;
  busy: boolean;
  title: string;
  description: string;
  submitLabel: string;
  onToggleType: (type: string) => void;
  onGenerate: () => void;
}) {
  const usesVisualGroups = Boolean(visualGroupsData?.config);
  const focusedGroup = visualGroupsData?.groups.find(
    (group) => group._id === focusedGroupId,
  );
  const totalImages = variants.preview?.totalImages ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-border bg-card sm:max-w-xl [&_[data-slot=dialog-close]]:size-11 sm:[&_[data-slot=dialog-close]]:size-8">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <VariantGenerationControls
            value={variants.variantSelection}
            onChange={variants.setVariantSelection}
            allProductsSeparated={variants.allProductsSeparated}
            separatedProductCount={variants.preview?.separatedProductCount ?? 0}
          />
          {usesVisualGroups ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                {focusedGroup ? "Déclinaison sélectionnée" : "Groupes visuels"}
              </legend>
              <p className="mb-3 text-xs text-muted-foreground">
                Sans référence propre au groupe, le texte de la variante définit
                ses caractéristiques. L’image produit sert de base. Les
                références du groupe doivent être confirmées pour être
                utilisées.
              </p>
              <div
                className={cn("grid gap-2", !focusedGroup && "sm:grid-cols-2")}
              >
                {(focusedGroup ? [focusedGroup] : visualGroupsData!.groups).map(
                  (group) => (
                    <VisualGroupGenerationChoice
                      key={group._id}
                      group={group}
                      selected={selectedGroupIds?.has(group._id) ?? false}
                      focused={Boolean(focusedGroup)}
                      textOnly={textOnlyGroupIds?.has(group._id) ?? false}
                      onToggleGroup={onToggleGroup}
                      onToggleReferences={onToggleGroupReferences}
                    />
                  ),
                )}
              </div>
            </fieldset>
          ) : null}

          <fieldset className={usesVisualGroups ? "border-t pt-4" : ""}>
            <legend className="mb-2 text-sm font-medium">Types d’image</legend>
            <div className="grid gap-2">
              {types.map((type) => (
                <Label
                  key={type.imageType}
                  className="flex min-h-11 justify-between rounded-lg border px-3 has-[:checked]:border-primary"
                >
                  <span>{type.label}</span>
                  <Checkbox
                    checked={selectedTypes.has(type.imageType)}
                    onCheckedChange={() => onToggleType(type.imageType)}
                  />
                </Label>
              ))}
            </div>
          </fieldset>
        </div>
        {variants.preview?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {variants.preview.error}
          </p>
        ) : null}
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-muted-foreground">
            {variants.previewPending
              ? "Calcul des images…"
              : `${totalImages} image${totalImages === 1 ? "" : "s"} à générer`}
          </span>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={
              variants.previewPending ||
              Boolean(variants.preview?.error) ||
              !totalImages ||
              !selectedTypes.size ||
              (usesVisualGroups && !selectedGroupIds?.size) ||
              busy
            }
            onClick={onGenerate}
          >
            <BusyIcon busy={busy} />
            {!busy ? <WandSparkles data-icon="inline-start" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
