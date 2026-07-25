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

export function GenerateImagesDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  visualGroupsData,
  selectedGroupIds,
  onToggle,
  onToggleGroup,
  busy,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Doc<"promptTemplates">[];
  selectedTypes: Set<string>;
  visualGroupsData: VisualGroupsData | null | undefined;
  selectedGroupIds: Set<Id<"visualGroups">>;
  onToggle: (type: string) => void;
  onToggleGroup: (groupId: Id<"visualGroups">) => void;
  busy: boolean;
  onGenerate: () => void;
}) {
  const usesVisualGroups = Boolean(visualGroupsData?.config);
  const totalImages =
    selectedTypes.size * (usesVisualGroups ? selectedGroupIds.size : 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl [&_[data-slot=dialog-close]]:size-11 sm:[&_[data-slot=dialog-close]]:size-8">
        <DialogHeader>
          <DialogTitle>Générer les images</DialogTitle>
          <DialogDescription>
            Sélectionnez les groupes visuels et les types d’image. Une tâche
            sera créée pour chaque combinaison.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {usesVisualGroups ? (
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
                      checked={selectedGroupIds.has(group._id)}
                      disabled={!group.ready}
                      onCheckedChange={() => onToggleGroup(group._id)}
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
                    onCheckedChange={() => onToggle(type.imageType)}
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
              (usesVisualGroups && !selectedGroupIds.size) ||
              busy
            }
            onClick={onGenerate}
          >
            <BusyIcon busy={busy} />
            {!busy ? <WandSparkles data-icon="inline-start" /> : null}
            Lancer la génération
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
