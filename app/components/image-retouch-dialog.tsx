import {
  Check,
  Droplets,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  Paintbrush,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Undo2,
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
import type { Id } from "../../convex/_generated/dataModel";

export type RetouchTarget = {
  id: Id<"generatedImages">;
  url: string;
  label: string;
};

export type RetouchSaveMode = "version" | "overwrite";

type Tool = "brush" | "picker";
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

const HISTORY_LIMIT = 12;
const SWATCHES = ["#ffffff", "#f8faf8", "#f1f3f0", "#e6e9e5", "#d7ddd8"];

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
  const loadTokenRef = useRef(0);
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
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
    updateBrushPreview(event);
    if (!drawingRef.current || tool !== "brush") return;
    const point = canvasPoint(event);
    if (point) drawTo(point);
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
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

  const displayWidth = imageSize ? Math.min(imageSize.width, 980) * zoom : 720;
  const busy = Boolean(saving || localSaving);
  const canEdit = Boolean(imageSize && !loading && !error);
  const showBrushPreview =
    brushPreview.visible &&
    tool === "brush" &&
    canEdit &&
    brushPreview.size > 0;

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="retouch-dialog-content max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-6xl">
        <div className="retouch-shell">
          <DialogHeader className="retouch-header">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Paintbrush className="size-5 text-[var(--retouch-blue)]" />
                Retouche manuelle
              </DialogTitle>
              <DialogDescription>
                Effacez les images fantomes sur fond clair sans relancer l'IA.
              </DialogDescription>
            </div>
            {imageSize ? (
              <span className="retouch-size">
                {imageSize.width} x {imageSize.height}px
              </span>
            ) : null}
          </DialogHeader>

          <div className="retouch-layout">
            <aside className="retouch-tools" aria-label="Outils de retouche">
              <div className="retouch-tool-group retouch-tool-mode">
                <Label className="text-xs uppercase text-muted-foreground">
                  Outils
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={tool === "brush" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTool("brush")}
                  >
                    <Paintbrush data-icon="inline-start" />
                    Pinceau
                  </Button>
                  <Button
                    type="button"
                    variant={tool === "picker" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTool("picker")}
                  >
                    <Pipette data-icon="inline-start" />
                    Pipette
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="retouch-tool-group retouch-tool-transform">
                <Label className="text-xs uppercase text-muted-foreground">
                  Transformer
                </Label>
                <div className="retouch-actions-grid">
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
              </div>

              <Separator />

              <div className="retouch-tool-group retouch-tool-color">
                <Label
                  htmlFor="retouch-color"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Couleur
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id="retouch-color"
                    type="color"
                    value={brushColor}
                    onChange={(event) => setBrushColor(event.target.value)}
                    className="retouch-color-input"
                  />
                  <input
                    value={brushColor}
                    onChange={(event) => setBrushColor(event.target.value)}
                    className="retouch-hex-input"
                    aria-label="Couleur du pinceau"
                  />
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className="retouch-swatch"
                      style={{ backgroundColor: swatch }}
                      aria-label={`Utiliser ${swatch}`}
                      onClick={() => setBrushColor(swatch)}
                    />
                  ))}
                </div>
              </div>

              <div className="retouch-tool-group retouch-tool-size">
                <Label
                  htmlFor="retouch-size"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Taille
                </Label>
                <div className="retouch-range-row">
                  <input
                    id="retouch-size"
                    type="range"
                    min={4}
                    max={140}
                    value={brushSize}
                    onChange={(event) =>
                      setBrushSize(Number(event.target.value))
                    }
                  />
                  <span>{brushSize}px</span>
                </div>
              </div>

              <div className="retouch-tool-group retouch-tool-opacity">
                <Label
                  htmlFor="retouch-opacity"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Opacite
                </Label>
                <div className="retouch-range-row">
                  <input
                    id="retouch-opacity"
                    type="range"
                    min={10}
                    max={100}
                    value={brushOpacity}
                    onChange={(event) =>
                      setBrushOpacity(Number(event.target.value))
                    }
                  />
                  <span>{brushOpacity}%</span>
                </div>
              </div>

              <Separator />

              <div className="retouch-history-panel">
                <div className="retouch-actions-grid">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!historyState.canUndo}
                    onClick={undo}
                  >
                    <Undo2 data-icon="inline-start" />
                    Reculer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!historyState.canRedo}
                    onClick={redo}
                  >
                    <Redo2 data-icon="inline-start" />
                    Avancer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setZoom((value) => Math.max(0.35, value - 0.15))
                    }
                  >
                    <ZoomOut data-icon="inline-start" />
                    Zoom
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setZoom((value) => Math.min(2.4, value + 0.15))
                    }
                  >
                    <ZoomIn data-icon="inline-start" />
                    Zoom
                  </Button>
                </div>
                <p className="retouch-history-readout" aria-live="polite">
                  {historyState.pastCount
                    ? `${historyState.pastCount} retour${
                        historyState.pastCount > 1 ? "s" : ""
                      } disponible${historyState.pastCount > 1 ? "s" : ""}`
                    : "Aucune modification"}
                  {historyState.futureCount
                    ? ` · ${historyState.futureCount} avance${
                        historyState.futureCount > 1 ? "s" : ""
                      }`
                    : ""}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!imageSize || loading}
                onClick={resetCanvas}
              >
                <RotateCcw data-icon="inline-start" />
                Recharger
              </Button>

              <div className="retouch-meter">
                <Droplets className="size-4" />
                <span>
                  Pinceau blanc, pipette pour les fonds legerement casses.
                </span>
              </div>
            </aside>

            <main className="retouch-stage">
              {loading ? (
                <div className="retouch-loading">
                  <Loader2 className="size-5 animate-spin" />
                  Chargement de l'image
                </div>
              ) : null}
              <div className="retouch-canvas-scroll">
                <div className="retouch-canvas-frame">
                  <canvas
                    ref={canvasRef}
                    className="retouch-canvas"
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
                      className="retouch-brush-preview"
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
          </div>

          {error ? (
            <Alert variant="destructive" className="mx-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="retouch-footer">
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
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              Enregistrer une version
            </Button>
            <Button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => void save("overwrite")}
            >
              {busy ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              Enregistrer et écraser
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
