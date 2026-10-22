import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

import { canGenerateVisualGroup } from "../lib/visualGroupGeneration";
import type { VisualGroupWithRows } from "../types";

export type VisualGroupGenerationChoiceProps = {
  group: VisualGroupWithRows;
  selected: boolean;
  focused: boolean;
  textOnly: boolean;
  onToggleGroup?: (groupId: Id<"visualGroups">) => void;
  onToggleReferences?: (groupId: Id<"visualGroups">) => void;
};

export function VisualGroupGenerationChoice({
  group,
  selected,
  focused,
  textOnly,
  onToggleGroup,
  onToggleReferences,
}: VisualGroupGenerationChoiceProps) {
  const hasReferences = group.references.length > 0;
  const usesReferences = hasReferences && !textOnly;
  const ready = canGenerateVisualGroup(group, textOnly);
  const GroupLabel = focused ? "div" : Label;
  let description = "À partir du texte de la variante";
  if (usesReferences) {
    description = group.ready
      ? "Références confirmées"
      : "Référence à confirmer";
  }

  return (
    <div
      className={cn("min-w-0 rounded-lg border", selected && "border-primary")}
    >
      <GroupLabel className="flex min-h-12 items-center gap-3 px-3 py-2">
        {!focused ? (
          <Checkbox
            checked={selected}
            aria-label={`Générer ${group.label}`}
            disabled={!ready && !selected}
            onCheckedChange={() => onToggleGroup?.(group._id)}
          />
        ) : null}
        <span
          className="size-4 shrink-0 rounded-full border"
          style={{ background: group.swatchCss ?? "var(--muted)" }}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm">{group.label}</span>
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        </span>
      </GroupLabel>
      {hasReferences ? (
        <Label className="flex min-h-11 items-center gap-2 border-t px-3 py-2 text-xs">
          <Checkbox
            checked={usesReferences}
            aria-label={`Utiliser les références du groupe ${group.label}`}
            onCheckedChange={() => onToggleReferences?.(group._id)}
          />
          Utiliser les références du groupe
        </Label>
      ) : null}
    </div>
  );
}
