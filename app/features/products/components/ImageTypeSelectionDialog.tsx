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
import type { Doc } from "@/lib/convex";


export function ImageTypeSelectionDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
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
  busy: boolean;
  title: string;
  description: string;
  submitLabel: string;
  onToggleType: (type: string) => void;
  onGenerate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label
              key={type.imageType}
              className="flex min-h-11 justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3"
            >
              <span>{type.label}</span>
              <Checkbox
                checked={selectedTypes.has(type.imageType)}
                onCheckedChange={() => onToggleType(type.imageType)}
              />
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!selectedTypes.size || busy}
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
