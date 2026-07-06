import { Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RetouchSaveMode } from "./types";

export function RetouchDialogFooter({
  activeToolLabel,
  busy,
  canEdit,
  historyReadout,
  onSave,
}: {
  activeToolLabel: string;
  busy: boolean;
  canEdit: boolean;
  historyReadout: string;
  onSave: (mode: RetouchSaveMode) => void;
}) {
  const isMobile = useIsMobile();
  const saveButtonSize = isMobile ? "icon" : "default";

  return (
    <DialogFooter className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-none border-t bg-card/95 px-4 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-2 max-[640px]:px-3">
      <div
        className="flex min-w-0 gap-2 text-xs tabular-nums text-muted-foreground max-[640px]:hidden"
        aria-live="polite"
      >
        <span className="block truncate">{activeToolLabel}</span>
        <Separator orientation="vertical" />
        <span className="block truncate">{historyReadout}</span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size={saveButtonSize}
          disabled={!canEdit || busy}
          onClick={() => onSave("version")}
          aria-label="Enregistrer une version"
        >
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          <span className="max-[640px]:sr-only">Enregistrer une version</span>
        </Button>
        <Button
          type="button"
          size={saveButtonSize}
          disabled={!canEdit || busy}
          onClick={() => onSave("overwrite")}
          aria-label="Remplacer l'image"
        >
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          <span className="max-[640px]:sr-only">Remplacer l'image</span>
        </Button>
      </div>
    </DialogFooter>
  );
}
