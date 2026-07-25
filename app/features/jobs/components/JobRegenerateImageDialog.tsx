import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Doc } from "@/lib/convex";

export function JobRegenerateImageDialog({
  image,
  instructions,
  regenerating,
  onClose,
  onInstructionsChange,
  onRegenerate,
}: {
  image: Doc<"generatedImages"> | null;
  instructions: string;
  regenerating: boolean;
  onClose: () => void;
  onInstructionsChange: (value: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Regenerate {image?.imageType}</DialogTitle>
          <DialogDescription>
            Add a correction to the existing prompt so the next image fixes what
            was wrong. Leave the field empty to regenerate with the original
            prompt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="regeneration-instructions">
            Correction instructions
          </Label>
          <Textarea
            id="regeneration-instructions"
            value={instructions}
            disabled={regenerating}
            maxLength={2000}
            rows={5}
            placeholder="Example: curtain must much more opaque. Do not show sunlight, window frame, or any background through fabric."
            onChange={(event) => onInstructionsChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {instructions.length} / 2000 characters
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={regenerating} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={regenerating} onClick={onRegenerate}>
            {regenerating ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
