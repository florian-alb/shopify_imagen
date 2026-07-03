import {
  Check,
  Droplets,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Loader2,
  Paintbrush,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

export type RetouchTarget = {
  id: Id<"generatedImages">;
  url: string;
  label: string;
};

export type RetouchSaveMode = "version" | "overwrite";

type Tool = "brush" | "picker" | "hand";
type CanvasTransform = "rotateClockwise" | "flipHorizontal" | "flipVertical";

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  width: number;
  height: number;
};

type BrushPreview = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
};

type CanvasSnapshot = {
  imageData: ImageData;
  width: number;
  height: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

const HISTORY_LIMIT = 12;
const SWATCHES = ["#ffffff", "#f8faf8", "#f1f3f0", "#e6e9e5", "#d7ddd8"];

const toolButtonClass =
  "rounded-[0.65rem] text-muted-foreground transition-all duration-150 hover:bg-foreground/5 hover:text-foreground active:translate-y-px active:scale-[0.98]";
const activeToolButtonClass =
  "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/_0.2),0_6px_16px_rgb(0_0_0_/_0.12)] hover:bg-primary hover:text-primary-foreground";
const panelSectionClass = "grid gap-3";
const fieldGroupClass = "grid gap-2";
const fieldLabelClass = "text-xs font-medium text-muted-foreground";
const rangeRowClass =
  "grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-2 text-xs tabular-nums text-muted-foreground";
const rangeInputClass = "w-full accent-primary";

export function ImageRetouchDialog({
  target,
  saving,
  onOpenChange,
  onPrepareSource,
  onSave,
}: {
  target: RetouchTarget | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onPrepareSource?: (target: RetouchTarget) => Promise<string>;
  onSave: (
    target: RetouchTarget,
    blob: Blob,
    mode: RetouchSaveMode,
  ) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadTokenRef = useRef(0);
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const panRef = useRef<PanState | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(34);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [loading, setLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    pastCount: 0,
    futureCount: 0,
  });
  const [brushPreview, setBrushPreview] = useState<BrushPreview>({
    x: 0,
    y: 0,
    size: 0,
    visible: false,
  });

  const syncHistoryState = useCallback(() => {
    const next = {
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
      pastCount: undoStackRef.current.length,
      futureCount: redoStackRef.current.length,
    };
    setHistoryState((current) =>
      current.canUndo === next.canUndo &&
      current.canRedo === next.canRedo &&
      current.pastCount === next.pastCount &&
      current.futureCount === next.futureCount
        ? current
        : next,
    );
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const captureSnapshot = useCallback((): CanvasSnapshot | null => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return null;

    return {
      imageData: context.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width,
      height: canvas.height,
    };
  }, []);

  const pushHistory = useCallback(() => {
    try {
      const snapshot = captureSnapshot();
      if (!snapshot) return;
      undoStackRef.current = [...undoStackRef.current, snapshot].slice(
        -HISTORY_LIMIT,
      );
      redoStackRef.current = [];
      syncHistoryState();
    } catch {
      setError("Cette image ne permet pas la retouche dans le navigateur.");
    }
  }, [captureSnapshot, syncHistoryState]);

  const restoreSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.putImageData(snapshot.imageData, 0, 0);
    setImageSize({ width: snapshot.width, height: snapshot.height });
  }, []);

  const resetCanvas = useCallback(async () => {
    if (!target) return;
    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    setLoading(true);
    setError(null);
    setImageSize(null);
    setZoom(1);
    setTool("brush");
    resetHistory();

    try {
      const sourceUrl = onPrepareSource
        ? await onPrepareSource(target)
        : target.url;
      if (loadTokenRef.current !== loadToken) return;

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Image download failed with status ${response.status}.`,
        );
      }

      const imageBlob = await response.blob();
      if (!imageBlob.size) throw new Error("L'image source est vide.");
      const objectUrl = URL.createObjectURL(imageBlob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (loadTokenRef.current !== loadToken) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !context) return;

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);

        try {
          context.getImageData(0, 0, 1, 1);
        } catch {
          setError(
            "Cette image bloque encore la lecture des pixels. La source doit passer par le proxy de retouche.",
          );
        }

        setImageSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        setLoading(false);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (loadTokenRef.current !== loadToken) return;
        setLoading(false);
        setError("Impossible de charger cette image pour la retouche.");
      };
      image.src = objectUrl;
    } catch (loadError) {
      if (loadTokenRef.current !== loadToken) return;
      setLoading(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger cette image pour la retouche.",
      );
    }
  }, [onPrepareSource, resetHistory, target]);

  useEffect(() => {
    if (!target) return;
    const timeoutId = window.setTimeout(resetCanvas, 0);
    return () => window.clearTimeout(timeoutId);
  }, [resetCanvas, target]);

  const canvasPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    [],
  );

  const updateBrushPreview = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || tool !== "brush" || loading || error || !imageSize) return;
      const rect = canvas.getBoundingClientRect();
      const scaledSize = Math.max(4, brushSize * (rect.width / canvas.width));
      setBrushPreview({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        size: scaledSize,
        visible: true,
      });
    },
    [brushSize, error, imageSize, loading, tool],
  );

  const hideBrushPreview = useCallback(() => {
    setBrushPreview((current) =>
      current.visible ? { ...current, visible: false } : current,
    );
  }, []);

  const pickColor = useCallback((point: Point) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    try {
      const pixel = context.getImageData(point.x, point.y, 1, 1).data;
      setBrushColor(
        `#${[pixel[0], pixel[1], pixel[2]]
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`,
      );
      setTool("brush");
    } catch {
      setError("La pipette ne peut pas lire les pixels de cette image.");
    }
  }, []);

  const drawTo = useCallback(
    (point: Point) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      context.save();
      context.globalAlpha = brushOpacity / 100;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = brushSize;
      context.strokeStyle = brushColor;
      context.fillStyle = brushColor;

      const previous = lastPointRef.current;
      if (!previous) {
        context.beginPath();
        context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }
      context.restore();
      lastPointRef.current = point;
    },
    [brushColor, brushOpacity, brushSize],
  );

  const applyCanvasTransform = useCallback(
    (transform: CanvasTransform) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageSize || loading || error) return;

      const source = document.createElement("canvas");
      source.width = canvas.width;
      source.height = canvas.height;
      const sourceContext = source.getContext("2d");
      if (!sourceContext) return;
      sourceContext.drawImage(canvas, 0, 0);

      pushHistory();

      const width = canvas.width;
      const height = canvas.height;

      if (transform === "rotateClockwise") {
        canvas.width = height;
        canvas.height = width;
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) return;
        context.translate(height, 0);
        context.rotate(Math.PI / 2);
        context.drawImage(source, 0, 0);
      } else {
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) return;
        context.clearRect(0, 0, width, height);
        context.save();
        if (transform === "flipHorizontal") {
          context.translate(width, 0);
          context.scale(-1, 1);
        } else {
          context.translate(0, height);
          context.scale(1, -1);
        }
        context.drawImage(source, 0, 0);
        context.restore();
      }

      setImageSize({ width: canvas.width, height: canvas.height });
      hideBrushPreview();
    },
    [error, hideBrushPreview, imageSize, loading, pushHistory],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!imageSize || loading || error) return;
    if (tool === "hand") {
      const scroll = scrollRef.current;
      if (!scroll) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
      };
      hideBrushPreview();
      return;
    }

    updateBrushPreview(event);
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "picker") {
      pickColor(point);
      return;
    }

    pushHistory();
    drawingRef.current = true;
    lastPointRef.current = null;
    drawTo(point);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "hand" && panRef.current?.pointerId === event.pointerId) {
      const scroll = scrollRef.current;
      if (!scroll) return;
      scroll.scrollLeft =
        panRef.current.scrollLeft - (event.clientX - panRef.current.startX);
      scroll.scrollTop =
        panRef.current.scrollTop - (event.clientY - panRef.current.startY);
      return;
    }

    updateBrushPreview(event);
    if (!drawingRef.current || tool !== "brush") return;
    const point = canvasPoint(event);
    if (point) drawTo(point);
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    const current = captureSnapshot();
    if (!current || !previous) return;
    redoStackRef.current.push(current);
    restoreSnapshot(previous);
    syncHistoryState();
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    const current = captureSnapshot();
    if (!current || !next) return;
    undoStackRef.current.push(current);
    restoreSnapshot(next);
    syncHistoryState();
  };

  const save = async (mode: RetouchSaveMode) => {
    const canvas = canvasRef.current;
    if (!target || !canvas) return;

    setLocalSaving(true);
    setError(null);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error("Impossible d'exporter la retouche."));
          }, "image/png");
        } catch (exportError) {
          reject(exportError);
        }
      });
      await onSave(target, blob, mode);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer la retouche.",
      );
    } finally {
      setLocalSaving(false);
    }
  };

  const displayWidth = imageSize ? Math.min(imageSize.width, 1280) * zoom : 720;
  const busy = Boolean(saving || localSaving);
  const canEdit = Boolean(imageSize && !loading && !error);
  const showBrushPreview =
    brushPreview.visible &&
    tool === "brush" &&
    canEdit &&
    brushPreview.size > 0;
  const zoomPercent = Math.round(zoom * 100);
  const activeToolLabel =
    tool === "brush" ? "Pinceau" : tool === "picker" ? "Pipette" : "Main";
  const historyReadout = historyState.pastCount
    ? `${historyState.pastCount} retour${
        historyState.pastCount > 1 ? "s" : ""
      } disponible${historyState.pastCount > 1 ? "s" : ""}${
        historyState.futureCount
          ? ` · ${historyState.futureCount} avance${
              historyState.futureCount > 1 ? "s" : ""
            }`
          : ""
      }`
    : "Aucune modification";

  return (
    <TooltipProvider>
      <Dialog open={target !== null} onOpenChange={onOpenChange}>
        <DialogContent
          className="!h-[calc(100dvh-2rem)] !max-h-none !w-[calc(100vw-2rem)] !max-w-none overflow-hidden rounded-2xl p-0 sm:!max-w-none max-[900px]:!h-[100dvh] max-[900px]:!max-h-[100dvh] max-[900px]:!w-screen max-[900px]:!max-w-screen max-[900px]:rounded-none"
          showCloseButton={false}
        >
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden bg-background">
            <DialogHeader className="flex min-h-14 items-center justify-between gap-4 border-b bg-card/90 px-4 py-2.5 max-[900px]:flex-wrap max-[900px]:items-start max-[900px]:px-3">
              <div className="grid min-w-0 gap-0.5">
                <DialogTitle className="flex items-center gap-2 text-[0.98rem] font-semibold leading-tight text-foreground">
                  <Paintbrush className="size-4 text-primary" />
                  Retouche image
                </DialogTitle>
                <DialogDescription className="text-xs leading-snug text-muted-foreground max-[640px]:hidden">
                  Effacez les images fantomes sur fond clair sans relancer l'IA.
                </DialogDescription>
              </div>

              <div
                className="flex min-w-0 flex-none items-center justify-end gap-2 max-[900px]:w-full max-[900px]:justify-start max-[900px]:overflow-x-auto max-[640px]:gap-1.5"
                aria-label="Actions rapides"
              >
                {imageSize ? (
                  <span className="inline-flex min-h-8 flex-none items-center rounded-lg border bg-background/80 px-2.5 text-xs tabular-nums text-muted-foreground max-[640px]:hidden">
                    {imageSize.width} x {imageSize.height}px
                  </span>
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
                    onClick={() =>
                      setZoom((value) => Math.max(0.35, value - 0.15))
                    }
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
                    onClick={() =>
                      setZoom((value) => Math.min(2.4, value + 0.15))
                    }
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
                    disabled={!historyState.canUndo}
                    onClick={undo}
                    aria-label="Annuler"
                  >
                    <Undo2 />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!historyState.canRedo}
                    onClick={redo}
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
                  onClick={() => onOpenChange(false)}
                  aria-label="Fermer"
                >
                  <X />
                </Button>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 overflow-hidden min-[901px]:grid-cols-[3.25rem_minmax(0,1fr)_18rem] max-[1100px]:min-[901px]:grid-cols-[3.25rem_minmax(0,1fr)_16rem] max-[900px]:grid-rows-[auto_minmax(0,1fr)_auto]">
              <aside
                className="flex min-h-0 min-w-0 flex-col items-center gap-2 border-r bg-card/80 px-2 py-3 max-[900px]:flex-row max-[900px]:justify-center max-[900px]:border-b max-[900px]:border-r-0 max-[900px]:p-2"
                aria-label="Outils"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        toolButtonClass,
                        tool === "brush" && activeToolButtonClass,
                      )}
                      aria-pressed={tool === "brush"}
                      aria-label="Pinceau"
                      onClick={() => setTool("brush")}
                    >
                      <Paintbrush />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Pinceau</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        toolButtonClass,
                        tool === "picker" && activeToolButtonClass,
                      )}
                      aria-pressed={tool === "picker"}
                      aria-label="Pipette"
                      onClick={() => setTool("picker")}
                    >
                      <Pipette />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Pipette</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        toolButtonClass,
                        tool === "hand" && activeToolButtonClass,
                      )}
                      aria-pressed={tool === "hand"}
                      aria-label="Main"
                      onClick={() => setTool("hand")}
                    >
                      <Hand />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Main</TooltipContent>
                </Tooltip>
              </aside>

              <main className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-[#f7f8f5] [background-image:linear-gradient(90deg,rgba(15,23,42,.055)_1px,transparent_1px),linear-gradient(rgba(15,23,42,.055)_1px,transparent_1px)] [background-size:32px_32px]">
                {loading ? (
                  <div className="absolute inset-4 z-10 grid content-center place-items-center gap-2 rounded-xl border border-dashed bg-background/80 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    Chargement de l'image
                  </div>
                ) : null}

                <div
                  ref={scrollRef}
                  className="grid min-h-0 place-items-center overflow-auto p-5 max-[900px]:p-3"
                >
                  <div className="relative w-fit leading-none">
                    <canvas
                      ref={canvasRef}
                      className="block h-auto max-w-none touch-none rounded-md border bg-white shadow-[0_1px_2px_rgb(32_35_38_/_0.08),0_14px_38px_rgb(32_35_38_/_0.12)] data-[tool=brush]:cursor-none data-[tool=hand]:cursor-grab data-[tool=picker]:cursor-copy"
                      style={{ width: displayWidth }}
                      aria-label={`Retoucher ${target?.label ?? "image"}`}
                      onPointerEnter={updateBrushPreview}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={stopDrawing}
                      onPointerCancel={stopDrawing}
                      onPointerLeave={hideBrushPreview}
                      data-tool={tool}
                    />
                    {showBrushPreview ? (
                      <div
                        className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border-[1.5px] bg-primary/10 shadow-[0_0_0_1px_rgb(255_255_255_/_0.78),0_2px_8px_rgb(32_35_38_/_0.18)] will-change-transform"
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
              </main>

              <aside
                className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain border-l bg-card/80 p-4 max-[900px]:grid max-[900px]:max-h-64 max-[900px]:grid-cols-2 max-[900px]:border-l-0 max-[900px]:border-t max-[900px]:p-3 max-[640px]:max-h-60 max-[640px]:grid-cols-1"
                aria-label="Reglages"
              >
                <section className={panelSectionClass}>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Outil actif</span>
                    <strong className="text-sm font-semibold text-foreground">
                      {activeToolLabel}
                    </strong>
                  </div>
                  <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                    {tool === "brush"
                      ? "Peindre avec une couleur proche du fond."
                      : tool === "picker"
                        ? "Cliquez dans l'image pour prelever une couleur."
                        : "Glissez dans l'image pour vous deplacer."}
                  </p>
                </section>

                <section
                  className={cn(panelSectionClass, "max-[900px]:row-span-2")}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Paintbrush className="size-4" />
                    Pinceau
                  </div>

                  <div className={fieldGroupClass}>
                    <Label htmlFor="retouch-size" className={fieldLabelClass}>
                      Taille
                    </Label>
                    <div className={rangeRowClass}>
                      <input
                        id="retouch-size"
                        type="range"
                        min={4}
                        max={140}
                        value={brushSize}
                        className={rangeInputClass}
                        onChange={(event) =>
                          setBrushSize(Number(event.target.value))
                        }
                      />
                      <span>{brushSize}px</span>
                    </div>
                  </div>

                  <div className={fieldGroupClass}>
                    <Label
                      htmlFor="retouch-opacity"
                      className={fieldLabelClass}
                    >
                      Opacite
                    </Label>
                    <div className={rangeRowClass}>
                      <input
                        id="retouch-opacity"
                        type="range"
                        min={10}
                        max={100}
                        value={brushOpacity}
                        className={rangeInputClass}
                        onChange={(event) =>
                          setBrushOpacity(Number(event.target.value))
                        }
                      />
                      <span>{brushOpacity}%</span>
                    </div>
                  </div>

                  <div className={fieldGroupClass}>
                    <Label htmlFor="retouch-color" className={fieldLabelClass}>
                      Couleur
                    </Label>
                    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2">
                      <input
                        id="retouch-color"
                        type="color"
                        value={brushColor}
                        onChange={(event) => setBrushColor(event.target.value)}
                        className="h-9 w-9 cursor-pointer overflow-hidden rounded-lg border bg-background p-0 focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)]"
                      />
                      <input
                        value={brushColor}
                        onChange={(event) => setBrushColor(event.target.value)}
                        className="h-9 min-w-0 rounded-lg border bg-background px-2.5 text-xs tabular-nums text-foreground outline-none focus:border-ring focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)]"
                        aria-label="Couleur du pinceau"
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          className={cn(
                            "aspect-square min-h-8 cursor-pointer rounded-full border shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.5)] outline-none transition-all duration-150 hover:-translate-y-px focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)]",
                            brushColor.toLowerCase() === swatch &&
                              "border-primary shadow-[inset_0_0_0_2px_rgb(255_255_255_/_0.85),0_0_0_2px_color-mix(in_oklch,var(--primary)_35%,transparent)]",
                          )}
                          style={{ backgroundColor: swatch }}
                          aria-label={`Utiliser ${swatch}`}
                          onClick={() => setBrushColor(swatch)}
                        />
                      ))}
                    </div>
                  </div>
                </section>

                <Separator />

                <section className={panelSectionClass}>
                  <div className="text-sm font-semibold text-foreground">
                    Transformer
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-[640px]:grid-cols-1 [&>button:first-child]:col-span-2 max-[640px]:[&>button:first-child]:col-span-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => applyCanvasTransform("rotateClockwise")}
                    >
                      <RotateCw data-icon="inline-start" />
                      Rotation
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => applyCanvasTransform("flipHorizontal")}
                    >
                      <FlipHorizontal2 data-icon="inline-start" />
                      Miroir H
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => applyCanvasTransform("flipVertical")}
                    >
                      <FlipVertical2 data-icon="inline-start" />
                      Miroir V
                    </Button>
                  </div>
                </section>

                <section className={panelSectionClass}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!imageSize || loading}
                    onClick={resetCanvas}
                    className="w-full"
                  >
                    <RotateCcw data-icon="inline-start" />
                    Recharger
                  </Button>

                  <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    <Droplets className="size-4 flex-none text-primary" />
                    <span>
                      Le blanc est le point de depart. Utilisez la pipette si le
                      fond est legerement casse.
                    </span>
                  </div>
                </section>
              </aside>
            </div>

            {error ? (
              <Alert variant="destructive" className="mx-4 mt-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-none border-t bg-card/90 px-4 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-2 max-[640px]:px-3">
              <div
                className="min-w-0 text-xs tabular-nums text-muted-foreground max-[640px]:hidden flex gap-1"
                aria-live="polite"
              >
                <span className="block truncate">{activeToolLabel}</span>
                <Separator orientation="vertical" />
                <span className="block truncate">{historyReadout}</span>
              </div>
              <div className="flex items-center justify-end gap-2 max-[640px]:grid max-[640px]:w-full max-[640px]:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  Fermer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || busy}
                  onClick={() => void save("version")}
                >
                  {busy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  Enregistrer une version
                </Button>
                <Button
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => void save("overwrite")}
                  className="max-[640px]:col-span-2"
                >
                  {busy ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  Remplacer l'image
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
