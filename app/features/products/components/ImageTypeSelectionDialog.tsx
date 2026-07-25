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

import type { VisualGroupsData } from "../types";

export function ImageTypeSelectionDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  visualGroupsData,
  selectedGroupIds,
  focusedGroupId,
  onToggleGroup,
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
  visualGroupsData?: VisualGroupsData | null;
  selectedGroupIds?: Set<Id<"visualGroups">>;
  focusedGroupId?: Id<"visualGroups"> | null;
  onToggleGroup?: (groupId: Id<"visualGroups">) => void;
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
  const totalImages =
    selectedTypes.size * (usesVisualGroups ? (selectedGroupIds?.size ?? 0) : 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-border bg-card sm:max-w-xl [&_[data-slot=dialog-close]]:size-11 sm:[&_[data-slot=dialog-close]]:size-8">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {focusedGroup ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span
                className="size-5 shrink-0 rounded-full border"
                style={{
                  background: focusedGroup.swatchCss ?? "var(--muted)",
                }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  Déclinaison sélectionnée
                </span>
                <span className="block truncate text-sm font-medium">
                  {focusedGroup.label}
                </span>
              </span>
            </div>
          ) : usesVisualGroups ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Groupes visuels
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {visualGroupsData!.groups.map((group) => (
                  <Label
                    key={group._id}
                    className={`flex min-h-12 items-center gap-3 rounded-lg border px-3 has-[:checked]:border-primary ${
                      group.ready
                        ? ""
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <Checkbox
                      checked={selectedGroupIds?.has(group._id) ?? false}
                      disabled={!group.ready}
                      onCheckedChange={() => onToggleGroup?.(group._id)}
                    />
                    <span
                      className="size-4 shrink-0 rounded-full border"
                      style={{
                        background: group.swatchCss ?? "var(--muted)",
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {group.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {group.ready
                          ? `${group.variants.length} variante${
                              group.variants.length === 1 ? "" : "s"
                            }`
                          : "Référence à confirmer"}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className={usesVisualGroups ? "border-t pt-4" : ""}>
            <legend className="mb-2 text-sm font-medium">
              Types d’image
            </legend>
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
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-muted-foreground">
            {totalImages} image{totalImages === 1 ? "" : "s"} à générer
          </span>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={
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
