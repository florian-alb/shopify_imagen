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

export function GenerateImagesDialog({
  open,
  onOpenChange,
  types,
  selectedTypes,
  onToggle,
  busy,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Doc<"promptTemplates">[];
  selectedTypes: Set<string>;
  onToggle: (type: string) => void;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate images</DialogTitle>
          <DialogDescription>
            Select image types for this product. Each type maps to a prompt
            template.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label
              key={type.imageType}
              className="flex min-h-11 justify-between rounded-lg border px-3"
            >
              <span>{type.label}</span>
              <Checkbox
                checked={selectedTypes.has(type.imageType)}
                onCheckedChange={() => onToggle(type.imageType)}
              />
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={!selectedTypes.size || busy} onClick={onGenerate}>
            <BusyIcon busy={busy} />
            {!busy ? <WandSparkles data-icon="inline-start" /> : null}
            Start background job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
