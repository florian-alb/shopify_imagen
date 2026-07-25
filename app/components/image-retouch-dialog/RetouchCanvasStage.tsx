import { Loader2 } from "lucide-react";
import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import { RetouchCanvas } from "./RetouchCanvas";
import { RetouchToolbar } from "./RetouchToolbar";
import type {
  BrushPreview,
  CanvasTransform,
  Point,
  RetouchTool,
} from "./types";

export function RetouchCanvasStage({
  activeToolLabel,
  brushColor,
  brushPreview,
  canEdit,
  canReload,
  canvasRef,
  displayWidth,
  floatingToolbarRef,
  historyReadout,
  loading,
  scrollRef,
  showBrushPreview,
  stageRef,
  targetLabel,
  tool,
  toolbarPosition,
  zoomPercent,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerEnter,
  onCanvasPointerLeave,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasWheel,
  onReset,
  onToolChange,
  onToolbarPointerCancel,
  onToolbarPointerDown,
  onToolbarPointerMove,
  onToolbarPointerUp,
  onTransform,
}: {
  activeToolLabel: string;
  brushColor: string;
  brushPreview: BrushPreview;
  canEdit: boolean;
  canReload: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displayWidth: number;
  floatingToolbarRef: RefObject<HTMLDivElement | null>;
  historyReadout: string;
  loading: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  showBrushPreview: boolean;
  stageRef: RefObject<HTMLElement | null>;
  targetLabel: string;
  tool: RetouchTool;
  toolbarPosition: Point | null;
  zoomPercent: number;
  onCanvasPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerEnter: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerLeave: () => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onReset: () => void;
  onToolChange: (tool: RetouchTool) => void;
  onToolbarPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onToolbarPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onToolbarPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onToolbarPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTransform: (transform: CanvasTransform) => void;
}) {
  return (
    <main
      ref={stageRef}
      className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-muted/40"
    >
      {loading ? (
        <div className="absolute inset-4 z-20 grid content-center place-items-center gap-2 rounded-xl border border-dashed bg-background/85 text-sm text-muted-foreground backdrop-blur">
          <Loader2 className="size-5 animate-spin" />
          Chargement de l'image
        </div>
      ) : null}

      <RetouchCanvas
        brushColor={brushColor}
        brushPreview={brushPreview}
        canvasRef={canvasRef}
        displayWidth={displayWidth}
        scrollRef={scrollRef}
        showBrushPreview={showBrushPreview}
        targetLabel={targetLabel}
        tool={tool}
        onPointerCancel={onCanvasPointerCancel}
        onPointerDown={onCanvasPointerDown}
        onPointerEnter={onCanvasPointerEnter}
        onPointerLeave={onCanvasPointerLeave}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onWheel={onCanvasWheel}
      />

      <RetouchToolbar
        canEdit={canEdit}
        canReload={canReload}
        floatingToolbarRef={floatingToolbarRef}
        tool={tool}
        toolbarPosition={toolbarPosition}
        onPointerCancel={onToolbarPointerCancel}
        onPointerDown={onToolbarPointerDown}
        onPointerMove={onToolbarPointerMove}
        onPointerUp={onToolbarPointerUp}
        onReset={onReset}
        onToolChange={onToolChange}
        onTransform={onTransform}
      />

      <div
        className="relative z-10 flex min-h-10 items-center justify-between gap-3 border-t bg-background/90 px-3 text-xs tabular-nums text-muted-foreground backdrop-blur max-[640px]:hidden"
        aria-live="polite"
      >
        <span className="truncate">{activeToolLabel}</span>
        <span className="truncate text-center">
          {zoomPercent}% · Cmd/Ctrl + molette
        </span>
        <span className="truncate text-right">{historyReadout}</span>
      </div>
    </main>
  );
}
