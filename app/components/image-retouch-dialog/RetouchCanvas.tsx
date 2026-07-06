import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { BrushPreview, RetouchTool } from "./types";

export function RetouchCanvas({
  brushColor,
  brushPreview,
  canvasRef,
  displayWidth,
  showBrushPreview,
  targetLabel,
  tool,
  scrollRef,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onWheel,
}: {
  brushColor: string;
  brushPreview: BrushPreview;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displayWidth: number;
  showBrushPreview: boolean;
  targetLabel: string;
  tool: RetouchTool;
  scrollRef: RefObject<HTMLDivElement | null>;
  onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerEnter: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      ref={scrollRef}
      className="grid min-h-0 place-items-center overflow-auto p-5 max-[900px]:p-3"
      onWheel={onWheel}
    >
      <div className="relative w-fit leading-none">
        <canvas
          ref={canvasRef}
          className="block h-auto max-w-none touch-none rounded-md border bg-white shadow-[0_1px_2px_rgb(32_35_38/0.08),0_14px_38px_rgb(32_35_38/0.12)] data-[tool=brush]:cursor-none data-[tool=hand]:cursor-grab data-[tool=picker]:cursor-copy"
          style={{ width: displayWidth }}
          aria-label={`Retoucher ${targetLabel}`}
          onPointerEnter={onPointerEnter}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          data-tool={tool}
        />

        {showBrushPreview ? (
          <div
            className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border-[1.5px] bg-primary/10 shadow-[0_0_0_1px_rgb(255_255_255/0.78),0_2px_8px_rgb(32_35_38/0.18)] will-change-transform"
            style={{
              width: brushPreview.size,
              height: brushPreview.size,
              borderColor: brushColor,
              transform: `translate(${
                brushPreview.x - brushPreview.size / 2
              }px, ${brushPreview.y - brushPreview.size / 2}px)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
