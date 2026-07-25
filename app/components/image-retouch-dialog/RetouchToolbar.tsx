import {
  FlipHorizontal2,
  FlipVertical2,
  GripHorizontal,
  Hand,
  Paintbrush,
  Pipette,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CanvasTransform, Point, RetouchTool } from "./types";

export function RetouchToolbar({
  canEdit,
  canReload,
  floatingToolbarRef,
  tool,
  toolbarPosition,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onReset,
  onToolChange,
  onTransform,
}: {
  canEdit: boolean;
  canReload: boolean;
  floatingToolbarRef: RefObject<HTMLDivElement | null>;
  tool: RetouchTool;
  toolbarPosition: Point | null;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onReset: () => void;
  onToolChange: (tool: RetouchTool) => void;
  onTransform: (transform: CanvasTransform) => void;
}) {
  return (
    <div
      ref={floatingToolbarRef}
      className={cn(
        "absolute z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl border bg-background/95 p-1.5 shadow-md backdrop-blur",
        toolbarPosition
          ? "translate-x-0"
          : "bottom-5 left-1/2 -translate-x-1/2",
      )}
      style={
        toolbarPosition
          ? { left: toolbarPosition.x, top: toolbarPosition.y }
          : undefined
      }
      aria-label="Barre flottante de retouche"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="cursor-grab rounded-xl active:cursor-grabbing"
            aria-label="Deplacer la barre d'outils"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <GripHorizontal />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Deplacer la barre</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1" aria-label="Outils">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={tool === "brush" ? "default" : "ghost"}
              size="icon-sm"
              className="rounded-xl"
              aria-pressed={tool === "brush"}
              aria-label="Pinceau"
              onClick={() => onToolChange("brush")}
            >
              <Paintbrush />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Pinceau (B)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={tool === "picker" ? "default" : "ghost"}
              size="icon-sm"
              className="rounded-xl"
              aria-pressed={tool === "picker"}
              aria-label="Pipette"
              onClick={() => onToolChange("picker")}
            >
              <Pipette />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Pipette (I)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={tool === "hand" ? "default" : "ghost"}
              size="icon-sm"
              className="rounded-xl"
              aria-pressed={tool === "hand"}
              aria-label="Main"
              onClick={() => onToolChange("hand")}
            >
              <Hand />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Main (H)</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1 pl-0.5" aria-label="Transformer">
        <span className="px-1 text-xs font-medium text-muted-foreground max-[640px]:sr-only">
          Transformer
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-xl"
              disabled={!canEdit}
              onClick={() => onTransform("rotateClockwise")}
              aria-label="Rotation"
            >
              <RotateCw />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Rotation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-xl"
              disabled={!canEdit}
              onClick={() => onTransform("flipHorizontal")}
              aria-label="Miroir horizontal"
            >
              <FlipHorizontal2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Miroir horizontal</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-xl"
              disabled={!canEdit}
              onClick={() => onTransform("flipVertical")}
              aria-label="Miroir vertical"
            >
              <FlipVertical2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Miroir vertical</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-xl"
              disabled={!canReload}
              onClick={onReset}
              aria-label="Recharger"
            >
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Recharger</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
