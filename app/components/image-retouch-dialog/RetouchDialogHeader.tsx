import { Redo2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImageSize } from "./types";

export function RetouchDialogHeader({
  busy,
  canRedo,
  canUndo,
  imageSize,
  targetLabel,
  zoomPercent,
  onClose,
  onRedo,
  onUndo,
  onZoomIn,
  onZoomOut,
}: {
  busy: boolean;
  canRedo: boolean;
  canUndo: boolean;
  imageSize: ImageSize | null;
  targetLabel: string;
  zoomPercent: number;
  onClose: () => void;
  onRedo: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <DialogHeader className="m-0 grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-card/95 px-4 py-2 max-[760px]:min-h-0 max-[760px]:grid-cols-1 max-[760px]:gap-2 max-[760px]:px-3">
      <div className="min-w-0">
        <DialogTitle className="truncate text-base font-semibold">
          Retouche image
        </DialogTitle>
        <DialogDescription className="sr-only">
          Atelier de retouche locale avec pinceau, pipette, main, historique,
          zoom et transformations.
        </DialogDescription>
        <p className="truncate text-xs text-muted-foreground">{targetLabel}</p>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2 max-[760px]:justify-between">
        {imageSize ? (
          <Badge
            variant="outline"
            className="min-h-8 flex-none tabular-nums max-[640px]:hidden"
          >
            {imageSize.width} x {imageSize.height}px
          </Badge>
        ) : null}

        <div
          className="inline-flex min-h-8 items-center gap-0.5 rounded-lg border bg-background/80 px-1 text-xs tabular-nums text-muted-foreground"
          aria-label="Zoom"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!imageSize}
            onClick={onZoomOut}
            aria-label="Zoom arriere"
          >
            <ZoomOut />
          </Button>
          <span className="min-w-12 text-center max-[640px]:min-w-10">
            {zoomPercent}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!imageSize}
            onClick={onZoomIn}
            aria-label="Zoom avant"
          >
            <ZoomIn />
          </Button>
        </div>

        <div
          className="inline-flex min-h-8 items-center gap-0.5 rounded-lg border bg-background/80 px-1"
          aria-label="Historique"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Annuler"
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Retablir"
          >
            <Redo2 />
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={onClose}
          aria-label="Fermer"
        >
          <X />
        </Button>
      </div>
    </DialogHeader>
  );
}
